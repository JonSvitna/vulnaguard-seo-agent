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

function fakeDependencies(leads, draftImpl = async () => ({
  emails: [{ touch_number: 1, subject: 'Hello', body: 'Body' }],
  linkedin_message: '',
})) {
  const calls = [];
  let sequenceId = 40;
  return {
    calls,
    deps: {
      query: async (sql, params = []) => {
        calls.push({ sql, params });
        if (sql.includes('SELECT * FROM leads')) {
          return leads.filter((item) => params[0].includes(item.id));
        }
        if (sql.includes('INSERT INTO sequences')) return [{ id: ++sequenceId }];
        return [];
      },
      draftSequence: draftImpl,
      onError: () => {},
    },
  };
}

test('drafts only eligible unsuppressed leads and reports skipped IDs', async () => {
  const { deps } = fakeDependencies([
    lead(1),
    lead(2, { status: 'unsubscribed' }),
    lead(3, { contact_email: '  ' }),
  ]);

  const results = await draftLeadIds([1, 2, 3], deps);

  assert.deepEqual(results, [
    { leadId: 1, status: 'drafted' },
    { leadId: 2, status: 'skipped', reason: 'ineligible_status' },
    { leadId: 3, status: 'skipped', reason: 'missing_email' },
  ]);
});

test('skips an already-drafted lead without invoking the copywriter', async () => {
  let drafts = 0;
  const { deps } = fakeDependencies([lead(7, { status: 'drafted' })], async () => {
    drafts++;
    return { emails: [], linkedin_message: '' };
  });

  const results = await draftLeadIds([7], deps);

  assert.deepEqual(results, [{ leadId: 7, status: 'skipped', reason: 'already_drafted' }]);
  assert.equal(drafts, 0);
});

test('passes the complete lead business line to draftSequence', async () => {
  let receivedLead;
  const { deps } = fakeDependencies([lead(8, { business_line: 'systems_automation' })], async (value) => {
    receivedLead = value;
    return { emails: [], linkedin_message: '' };
  });

  await draftLeadIds([8], deps);

  assert.equal(receivedLead.business_line, 'systems_automation');
});

test('keeps sequence and email records in the existing database tables', async () => {
  const { deps, calls } = fakeDependencies([lead(9)], async () => ({
    emails: [
      { touch_number: 1, subject: 'First', body: 'One' },
      { touch_number: 2, subject: 'Second', body: 'Two', flagged_reason: 'review' },
    ],
    linkedin_message: 'LinkedIn note',
  }));

  assert.deepEqual(await draftLeadIds([9], deps), [{ leadId: 9, status: 'drafted' }]);

  assert.equal(calls.filter(({ sql }) => sql.includes('DELETE FROM sequences')).length, 1);
  assert.equal(calls.filter(({ sql }) => sql.includes('INSERT INTO sequences')).length, 1);
  assert.equal(calls.filter(({ sql }) => sql.includes('INSERT INTO emails')).length, 2);
  assert.equal(calls.filter(({ sql }) => sql.includes('INSERT INTO linkedin_messages')).length, 1);
  assert.equal(calls.filter(({ sql }) => sql.includes("UPDATE leads SET status = 'drafted'")).length, 1);
});

test('returns per-lead partial failures without redrafting successful leads', async () => {
  const draftedIds = [];
  const { deps } = fakeDependencies([lead(11), lead(12), lead(13)], async (value) => {
    draftedIds.push(value.id);
    if (value.id === 12) throw new Error('provider unavailable');
    return { emails: [], linkedin_message: '' };
  });

  const results = await draftLeadIds([11, 12, 13, 11], deps);

  assert.deepEqual(results, [
    { leadId: 11, status: 'drafted' },
    { leadId: 12, status: 'failed', reason: 'provider unavailable' },
    { leadId: 13, status: 'drafted' },
  ]);
  assert.deepEqual(draftedIds, [11, 12, 13]);
});

test('continues after a no-email status write and error callback both fail', async () => {
  const draftedIds = [];
  const { deps } = fakeDependencies([
    lead(21, { contact_email: null }),
    lead(22),
  ], async (value) => {
    draftedIds.push(value.id);
    return { emails: [], linkedin_message: '' };
  });
  const baseQuery = deps.query;
  deps.query = async (sql, params) => {
    if (sql.includes("status = 'no_email'")) throw new Error('database unavailable');
    return baseQuery(sql, params);
  };
  deps.onError = () => {
    throw new Error('logger unavailable');
  };

  const results = await draftLeadIds([21, 22, 22], deps);

  assert.deepEqual(results, [
    { leadId: 21, status: 'failed', reason: 'database unavailable' },
    { leadId: 22, status: 'drafted' },
  ]);
  assert.deepEqual(draftedIds, [22]);
});
