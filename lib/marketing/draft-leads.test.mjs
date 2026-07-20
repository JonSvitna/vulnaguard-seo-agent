import test from 'node:test';
import assert from 'node:assert/strict';

import { draftLeadIds } from './draft-leads.ts';

function lead(id, overrides = {}) {
  return {
    id,
    company_name: `Company ${id}`,
    contact_email: `person${id}@example.com`,
    status: 'discovered',
    business_line: 'website_dev',
    ...overrides,
  };
}

function clone(value) {
  return structuredClone(value);
}

function fakeDependencies(initialLeads, options = {}) {
  const state = {
    leads: clone(initialLeads),
    sequences: clone(options.sequences ?? []),
    emails: clone(options.emails ?? []),
    linkedin: clone(options.linkedin ?? []),
  };
  const calls = [];
  const errors = [];
  let sequenceId = 100;
  let transactionTail = Promise.resolve();

  function makeQuery(target, transactional) {
    return async (sql, params = []) => {
      calls.push({ sql, params, transactional });
      if (options.failSql?.(sql, params, calls)) throw new Error(options.failureMessage ?? 'database unavailable');
      if (sql.includes('SELECT * FROM leads') && sql.includes('ANY')) {
        return target.leads.filter((item) => params[0].includes(item.id)).map(clone);
      }
      if (sql.includes('SELECT * FROM leads') && sql.includes('FOR UPDATE')) {
        const found = target.leads.find((item) => item.id === params[0]);
        return found ? [clone(found)] : [];
      }
      if (sql.includes("status = 'no_email'")) {
        const found = target.leads.find((item) => item.id === params[0]);
        if (found?.status === 'discovered') found.status = 'no_email';
        return [];
      }
      if (sql.includes('DELETE FROM sequences')) {
        const removed = target.sequences.filter((item) => item.lead_id === params[0]).map((item) => item.id);
        target.sequences = target.sequences.filter((item) => item.lead_id !== params[0]);
        target.emails = target.emails.filter((item) => !removed.includes(item.sequence_id));
        target.linkedin = target.linkedin.filter((item) => !removed.includes(item.sequence_id));
        return [];
      }
      if (sql.includes('INSERT INTO sequences')) {
        const row = { id: ++sequenceId, lead_id: params[0], status: 'drafted' };
        target.sequences.push(row);
        return [{ id: row.id }];
      }
      if (sql.includes('INSERT INTO emails')) {
        target.emails.push({ sequence_id: params[0], lead_id: params[1], touch_number: params[2] });
        return [];
      }
      if (sql.includes('INSERT INTO linkedin_messages')) {
        target.linkedin.push({ sequence_id: params[0], lead_id: params[1] });
        return [];
      }
      if (sql.includes("UPDATE leads SET status = 'drafted'")) {
        const found = target.leads.find((item) => item.id === params[0]);
        if (found?.status === 'discovered') found.status = 'drafted';
        return [];
      }
      return [];
    };
  }

  const deps = {
    query: makeQuery(state, false),
    transaction: async (work) => {
      const previous = transactionTail;
      let release;
      transactionTail = new Promise((resolve) => { release = resolve; });
      await previous;
      try {
        options.beforeTransaction?.(state);
        const pending = clone(state);
        const result = await work(makeQuery(pending, true));
        Object.assign(state, pending);
        return result;
      } finally {
        release();
      }
    },
    draftSequence: options.draftSequence ?? (async () => ({
      emails: [{ touch_number: 1, subject: 'Hello', body: 'Body' }],
      linkedin_message: '',
    })),
    onError: (id, error) => errors.push({ id, error }),
  };

  return { state, calls, errors, deps };
}

test('drafts only eligible unsuppressed leads and reports skipped IDs', async () => {
  const { deps, state } = fakeDependencies([
    lead(1),
    lead(2, { status: 'unsubscribed' }),
    lead(3, { contact_email: '  ' }),
  ]);

  assert.deepEqual(await draftLeadIds([1, 2, 3], deps), [
    { leadId: 1, status: 'drafted' },
    { leadId: 2, status: 'skipped', reason: 'ineligible_status' },
    { leadId: 3, status: 'skipped', reason: 'missing_email' },
  ]);
  assert.equal(state.leads.find((item) => item.id === 3).status, 'no_email');
});

test('skips an already-drafted lead without invoking the copywriter', async () => {
  let drafts = 0;
  const { deps } = fakeDependencies([lead(7, { status: 'drafted' })], {
    draftSequence: async () => { drafts++; return { emails: [], linkedin_message: '' }; },
  });
  assert.deepEqual(await draftLeadIds([7], deps), [
    { leadId: 7, status: 'skipped', reason: 'already_drafted' },
  ]);
  assert.equal(drafts, 0);
});

test('passes the complete lead business line to draftSequence', async () => {
  let receivedLead;
  const { deps } = fakeDependencies([lead(8, { business_line: 'systems_automation' })], {
    draftSequence: async (value) => { receivedLead = value; return { emails: [], linkedin_message: '' }; },
  });
  await draftLeadIds([8], deps);
  assert.equal(receivedLead.business_line, 'systems_automation');
});

test('persists the sequence and all child records in one transaction', async () => {
  const { deps, calls } = fakeDependencies([lead(9)], {
    draftSequence: async () => ({
      emails: [
        { touch_number: 1, subject: 'First', body: 'One' },
        { touch_number: 2, subject: 'Second', body: 'Two', flagged_reason: 'review' },
      ],
      linkedin_message: 'LinkedIn note',
    }),
  });
  assert.deepEqual(await draftLeadIds([9], deps), [{ leadId: 9, status: 'drafted' }]);
  const mutations = calls.filter(({ sql }) => /DELETE FROM sequences|INSERT INTO (sequences|emails|linkedin_messages)|UPDATE leads SET status = 'drafted'/.test(sql));
  assert.equal(mutations.length, 6);
  assert.ok(mutations.every((call) => call.transactional));
  assert.ok(calls.some(({ sql }) => sql.includes('FOR UPDATE')));
});

for (const [name, failSql] of [
  ['after delete', (sql) => sql.includes('INSERT INTO sequences')],
  ['after sequence insert', (sql) => sql.includes('INSERT INTO emails')],
  ['during child insertion', (sql, params) => sql.includes('INSERT INTO emails') && params[2] === 2],
]) {
  test(`rolls back the complete draft when persistence fails ${name}`, async () => {
    const original = {
      sequences: [{ id: 50, lead_id: 10, status: 'drafted' }],
      emails: [{ sequence_id: 50, lead_id: 10, touch_number: 99 }],
    };
    const { deps, state, errors } = fakeDependencies([lead(10)], {
      ...original,
      failSql,
      draftSequence: async () => ({
        emails: [
          { touch_number: 1, subject: 'One', body: 'One' },
          { touch_number: 2, subject: 'Two', body: 'Two' },
        ],
        linkedin_message: '',
      }),
    });
    assert.deepEqual(await draftLeadIds([10], deps), [
      { leadId: 10, status: 'failed', reason: 'persistence_failed' },
    ]);
    assert.deepEqual(state.sequences, original.sequences);
    assert.deepEqual(state.emails, original.emails);
    assert.equal(state.leads[0].status, 'discovered');
    assert.match(errors[0].error.message, /database unavailable/);
  });
}

test('returns a stable generation failure code and continues later IDs once', async () => {
  const draftedIds = [];
  const { deps, errors } = fakeDependencies([lead(11), lead(12), lead(13)], {
    draftSequence: async (value) => {
      draftedIds.push(value.id);
      if (value.id === 12) throw new Error('secret provider detail');
      return { emails: [], linkedin_message: '' };
    },
  });
  assert.deepEqual(await draftLeadIds([11, 12, 13, 11], deps), [
    { leadId: 11, status: 'drafted' },
    { leadId: 12, status: 'failed', reason: 'draft_generation_failed' },
    { leadId: 13, status: 'drafted' },
  ]);
  assert.deepEqual(draftedIds, [11, 12, 13]);
  assert.match(errors[0].error.message, /secret provider detail/);
});

test('revalidates suppression after locking and does not persist', async () => {
  let changed = false;
  const { deps, state } = fakeDependencies([lead(20)], {
    beforeTransaction: (database) => {
      if (!changed) database.leads[0].status = 'unsubscribed';
      changed = true;
    },
  });
  assert.deepEqual(await draftLeadIds([20], deps), [
    { leadId: 20, status: 'skipped', reason: 'ineligible_status' },
  ]);
  assert.equal(state.sequences.length, 0);
});

test('serializes concurrent persistence so only one caller creates a draft', async () => {
  let waiting = 0;
  let releaseDrafts;
  const bothDrafting = new Promise((resolve) => { releaseDrafts = resolve; });
  const { deps, state } = fakeDependencies([lead(30)], {
    draftSequence: async () => {
      waiting++;
      if (waiting === 2) releaseDrafts();
      await bothDrafting;
      return { emails: [{ touch_number: 1, subject: 'Hi', body: 'Body' }], linkedin_message: '' };
    },
  });

  const [first, second] = await Promise.all([draftLeadIds([30], deps), draftLeadIds([30], deps)]);
  assert.deepEqual([first[0].status, second[0].status].sort(), ['drafted', 'skipped']);
  assert.equal(state.sequences.length, 1);
  assert.equal(state.emails.length, 1);
  assert.equal(state.leads[0].status, 'drafted');
});

test('an onError failure cannot abort later leads', async () => {
  const { deps } = fakeDependencies([lead(40), lead(41)], {
    draftSequence: async (value) => {
      if (value.id === 40) throw new Error('provider unavailable');
      return { emails: [], linkedin_message: '' };
    },
  });
  deps.onError = () => { throw new Error('logger unavailable'); };
  assert.deepEqual(await draftLeadIds([40, 41], deps), [
    { leadId: 40, status: 'failed', reason: 'draft_generation_failed' },
    { leadId: 41, status: 'drafted' },
  ]);
});
