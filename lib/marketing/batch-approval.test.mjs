import test from 'node:test';
import assert from 'node:assert/strict';

import {
  approveClayBatch,
  approveSequenceIds,
  getClayBatchSummary,
  rejectClayBatch,
  rejectSequenceIds,
} from './batch-approval.ts';

const BATCH_ID = 'clay-2026-07-20';

function clone(value) {
  return structuredClone(value);
}

function seedState() {
  return {
    leads: [
      {
        id: 1,
        company_name: 'Acme Plumbing',
        website: 'https://acme.example',
        batch_id: BATCH_ID,
        category: 'clay_leads',
        fit_score: 84,
        fit_reason: 'Outdated website',
        recommended_service: 'website_design',
        contact_email: 'alex@acme.example',
        status: 'drafted',
      },
      {
        id: 2,
        company_name: 'Secure Co',
        website: 'https://secure.example',
        batch_id: BATCH_ID,
        category: 'clay_leads',
        fit_score: 78,
        fit_reason: 'Cyber need',
        recommended_service: 'cybersecurity',
        contact_email: 'pat@secure.example',
        status: 'drafted',
      },
      {
        id: 3,
        company_name: 'Auto Systems',
        website: 'https://auto.example',
        batch_id: BATCH_ID,
        category: 'clay_leads',
        fit_score: 81,
        fit_reason: 'Automation fit',
        recommended_service: 'systems_automation',
        contact_email: 'sam@auto.example',
        status: 'drafted',
      },
      {
        id: 4,
        company_name: 'Other Batch Inc',
        website: 'https://other.example',
        batch_id: 'clay-other',
        category: 'clay_leads',
        fit_score: 90,
        fit_reason: 'Different batch',
        recommended_service: 'website_design',
        contact_email: 'other@example.com',
        status: 'drafted',
      },
      {
        id: 5,
        company_name: 'Already Approved',
        website: 'https://approved.example',
        batch_id: BATCH_ID,
        category: 'clay_leads',
        fit_score: 75,
        fit_reason: 'Already done',
        recommended_service: 'compliance_cmmc',
        contact_email: 'done@example.com',
        status: 'approved',
      },
    ],
    sequences: [
      { id: 101, lead_id: 1, status: 'drafted' },
      { id: 102, lead_id: 2, status: 'drafted' },
      { id: 103, lead_id: 3, status: 'drafted' },
      { id: 104, lead_id: 4, status: 'drafted' },
      { id: 105, lead_id: 5, status: 'approved' },
    ],
    emails: [
      {
        sequence_id: 101,
        touch_number: 1,
        subject: 'A practical website update',
        body: 'Alex, I noticed your site could use a refresh to better convert local customers who search for plumbing help online every week.',
        scheduled_at: null,
      },
      { sequence_id: 101, touch_number: 2, subject: 'Follow up', body: 'Touch 2', scheduled_at: null },
      {
        sequence_id: 102,
        touch_number: 1,
        subject: 'Security checkup',
        body: 'Pat, a quick vulnerability scan would surface the gaps before they become incidents.',
        scheduled_at: null,
      },
      {
        sequence_id: 103,
        touch_number: 1,
        subject: 'Automate the busywork',
        body: 'Sam, systems automation can reclaim hours your team spends on repetitive ops.',
        scheduled_at: null,
      },
      {
        sequence_id: 104,
        touch_number: 1,
        subject: 'Other batch',
        body: 'Should not appear in clay-2026-07-20 samples.',
        scheduled_at: null,
      },
      {
        sequence_id: 105,
        touch_number: 1,
        subject: 'Already approved',
        body: 'Terminal sequence should not be re-approved.',
        scheduled_at: null,
      },
    ],
    config: { sequence_delay_days: '4,9,14' },
  };
}

function fakeDependencies(initialState = seedState(), options = {}) {
  const state = clone(initialState);
  const calls = [];
  const errors = [];
  let sendCalls = 0;

  const query = async (sql, params = []) => {
    calls.push({ sql, params });
    if (options.failSql?.(sql, params, calls)) {
      throw new Error(options.failureMessage ?? 'database unavailable');
    }

    if (sql.includes('AVG(l.fit_score)') && sql.includes('batch_id')) {
      const leads = state.leads.filter((lead) => lead.batch_id === params[0]);
      const draftCount = state.sequences.filter((seq) => {
        const lead = state.leads.find((item) => item.id === seq.lead_id);
        return lead?.batch_id === params[0] && seq.status === 'drafted';
      }).length;
      const scores = leads.map((lead) => lead.fit_score).filter((score) => Number.isFinite(score));
      const average = scores.length
        ? scores.reduce((sum, score) => sum + score, 0) / scores.length
        : null;
      return [{
        lead_count: String(leads.length),
        draft_count: String(draftCount),
        average_fit_score: average == null ? null : String(average),
      }];
    }

    if (sql.includes('recommended_service') && sql.includes('GROUP BY')) {
      const counts = new Map();
      for (const lead of state.leads.filter((item) => item.batch_id === params[0])) {
        const key = lead.recommended_service ?? 'unknown';
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      return [...counts.entries()].map(([recommended_service, count]) => ({
        recommended_service,
        count: String(count),
      }));
    }

    if (sql.includes('FROM sequences s') && sql.includes('touch_number = 1') && sql.includes('LIMIT')) {
      const rows = state.sequences
        .filter((seq) => {
          const lead = state.leads.find((item) => item.id === seq.lead_id);
          return lead?.batch_id === params[0] && seq.status === 'drafted';
        })
        .sort((a, b) => a.id - b.id)
        .map((seq) => {
          const lead = state.leads.find((item) => item.id === seq.lead_id);
          const email = state.emails.find(
            (item) => item.sequence_id === seq.id && item.touch_number === 1,
          );
          return {
            company_name: lead.company_name,
            subject: email?.subject ?? null,
            body: email?.body ?? null,
          };
        })
        .slice(0, params[1] ?? 3);
      return rows;
    }

    if (
      sql.includes('SELECT s.id')
      && sql.includes('batch_id')
      && sql.includes("status = 'drafted'")
      && !sql.includes('UPDATE')
    ) {
      return state.sequences
        .filter((seq) => {
          const lead = state.leads.find((item) => item.id === seq.lead_id);
          return lead?.batch_id === params[0] && seq.status === 'drafted';
        })
        .map((seq) => ({ id: seq.id }));
    }

    if (sql.includes("UPDATE sequences SET status = 'approved'") && sql.includes('ANY')) {
      const ids = params[0];
      const updated = [];
      for (const seq of state.sequences) {
        if (ids.includes(seq.id) && seq.status === 'drafted') {
          seq.status = 'approved';
          updated.push({ id: seq.id, lead_id: seq.lead_id });
        }
      }
      return updated;
    }

    if (sql.includes("UPDATE sequences SET status = 'rejected'") && sql.includes('ANY')) {
      const ids = params[0];
      const updated = [];
      for (const seq of state.sequences) {
        if (ids.includes(seq.id) && seq.status === 'drafted') {
          seq.status = 'rejected';
          updated.push({ id: seq.id, lead_id: seq.lead_id });
        }
      }
      return updated;
    }

    if (sql.includes("UPDATE leads SET status = 'approved'")) {
      const ids = params[0];
      for (const lead of state.leads) {
        if (ids.includes(lead.id)) lead.status = 'approved';
      }
      return [];
    }

    if (sql.includes("UPDATE leads SET status = 'rejected'")) {
      const ids = params[0];
      for (const lead of state.leads) {
        if (ids.includes(lead.id)) lead.status = 'rejected';
      }
      return [];
    }

    if (sql.includes("key = 'sequence_delay_days'")) {
      return [{ value: state.config.sequence_delay_days }];
    }

    if (sql.includes('UPDATE emails SET scheduled_at = NOW()') && sql.includes('touch_number = 1')) {
      const ids = params[0];
      for (const email of state.emails) {
        if (ids.includes(email.sequence_id) && email.touch_number === 1) {
          email.scheduled_at = 'now';
        }
      }
      return [];
    }

    if (sql.includes('SELECT DISTINCT touch_number')) {
      const ids = params[0];
      const touches = new Set(
        state.emails
          .filter((email) => ids.includes(email.sequence_id) && email.touch_number > 1)
          .map((email) => email.touch_number),
      );
      return [...touches].sort((a, b) => a - b).map((touch_number) => ({ touch_number }));
    }

    if (sql.includes('UPDATE emails SET scheduled_at = NOW() + make_interval')) {
      const ids = params[0];
      const touchNumber = params[2];
      for (const email of state.emails) {
        if (ids.includes(email.sequence_id) && email.touch_number === touchNumber) {
          email.scheduled_at = `now+${params[1]}d`;
        }
      }
      return [];
    }

    if (sql.includes("SELECT s.id FROM sequences s JOIN leads l") && sql.includes("status = 'drafted'")) {
      return state.sequences
        .filter((seq) => {
          if (seq.status !== 'drafted') return false;
          const lead = state.leads.find((item) => item.id === seq.lead_id);
          return Boolean(lead?.contact_email?.trim());
        })
        .map((seq) => ({ id: seq.id }));
    }

    return [];
  };

  const deps = {
    query,
    runSendBatch: options.runSendBatch ?? (async () => {
      sendCalls += 1;
      return { ok: true, sent: 2, failed: 0, total: 2, skipped_linkedin: 0, capped: false, remaining_today: 48, errors: [] };
    }),
    onError: (error) => errors.push(error),
  };

  return { state, deps, calls, errors, getSendCalls: () => sendCalls };
}

test('getClayBatchSummary returns counts, services, average score, and samples', async () => {
  const { deps } = fakeDependencies();
  const summary = await getClayBatchSummary(BATCH_ID, deps);

  assert.equal(summary.batch_id, BATCH_ID);
  assert.equal(summary.lead_count, 4);
  assert.equal(summary.draft_count, 3);
  assert.deepEqual(summary.services, {
    website_design: 1,
    cybersecurity: 1,
    systems_automation: 1,
    compliance_cmmc: 1,
  });
  assert.equal(summary.average_fit_score, 79.5);
  assert.equal(summary.dashboard_path, `/dashboard/marketing-agents?category=clay_leads&batch_id=${BATCH_ID}`);
  assert.equal(summary.samples.length, 3);
  assert.equal(summary.samples[0].company_name, 'Acme Plumbing');
  assert.equal(summary.samples[0].subject, 'A practical website update');
  assert.ok(summary.samples[0].preview.length <= 120);
  assert.match(summary.samples[0].preview, /^Alex, I noticed/);
});

test('approveClayBatch approves drafted sequences in the batch and schedules touches', async () => {
  const { state, deps, getSendCalls } = fakeDependencies();
  const result = await approveClayBatch(BATCH_ID, deps);

  assert.equal(result.approved, 3);
  assert.equal(result.sent, 2);
  assert.equal(result.failed, 0);
  assert.equal(getSendCalls(), 1);
  assert.equal(state.sequences.find((seq) => seq.id === 101).status, 'approved');
  assert.equal(state.sequences.find((seq) => seq.id === 104).status, 'drafted');
  assert.equal(state.sequences.find((seq) => seq.id === 105).status, 'approved');
  assert.equal(state.leads.find((lead) => lead.id === 1).status, 'approved');
  assert.equal(state.emails.find((email) => email.sequence_id === 101 && email.touch_number === 1).scheduled_at, 'now');
  assert.equal(state.emails.find((email) => email.sequence_id === 101 && email.touch_number === 2).scheduled_at, 'now+4d');
});

test('rejectClayBatch rejects drafted sequences and leads in the batch', async () => {
  const { state, deps } = fakeDependencies();
  const result = await rejectClayBatch(BATCH_ID, deps);

  assert.equal(result.rejected, 3);
  assert.equal(state.sequences.find((seq) => seq.id === 101).status, 'rejected');
  assert.equal(state.leads.find((lead) => lead.id === 1).status, 'rejected');
  assert.equal(state.sequences.find((seq) => seq.id === 104).status, 'drafted');
  assert.equal(state.sequences.find((seq) => seq.id === 105).status, 'approved');
});

test('re-approving an already-approved batch is a no-op and does not send again', async () => {
  const { deps, getSendCalls } = fakeDependencies();
  await approveClayBatch(BATCH_ID, deps);
  assert.equal(getSendCalls(), 1);

  const replay = await approveClayBatch(BATCH_ID, deps);
  assert.equal(replay.approved, 0);
  assert.equal(replay.sent, 0);
  assert.equal(replay.failed, 0);
  assert.equal(getSendCalls(), 1);
});

test('re-rejecting an already-rejected batch is a no-op', async () => {
  const { deps } = fakeDependencies();
  await rejectClayBatch(BATCH_ID, deps);
  const replay = await rejectClayBatch(BATCH_ID, deps);
  assert.equal(replay.rejected, 0);
});

test('approveSequenceIds protects terminal sequences and calls send exactly once', async () => {
  const { state, deps, getSendCalls } = fakeDependencies();
  const result = await approveSequenceIds([101, 105], deps);

  assert.equal(result.approved, 1);
  assert.equal(getSendCalls(), 1);
  assert.equal(state.sequences.find((seq) => seq.id === 101).status, 'approved');
  assert.equal(state.sequences.find((seq) => seq.id === 105).status, 'approved');

  const replay = await approveSequenceIds([101, 105], deps);
  assert.equal(replay.approved, 0);
  assert.equal(getSendCalls(), 1);
});

test('rejectSequenceIds only rejects drafted sequences', async () => {
  const { state, deps } = fakeDependencies();
  const result = await rejectSequenceIds([101, 105], deps);

  assert.equal(result.rejected, 1);
  assert.equal(state.sequences.find((seq) => seq.id === 101).status, 'rejected');
  assert.equal(state.sequences.find((seq) => seq.id === 105).status, 'approved');
  assert.equal(state.leads.find((lead) => lead.id === 1).status, 'rejected');
  assert.equal(state.leads.find((lead) => lead.id === 5).status, 'approved');
});

test('send-runner errors are reported without failing the approval result', async () => {
  const { deps, errors } = fakeDependencies(seedState(), {
    runSendBatch: async () => {
      throw new Error('resend unavailable');
    },
  });

  const result = await approveSequenceIds([101], deps);
  assert.equal(result.approved, 1);
  assert.equal(result.sent, 0);
  assert.equal(result.failed, 0);
  assert.equal(errors.length, 1);
});
