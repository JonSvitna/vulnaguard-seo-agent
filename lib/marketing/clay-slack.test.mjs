import test from 'node:test';
import assert from 'node:assert/strict';

import { buildClaySlackMessage } from './clay-slack.ts';

const SUMMARY = Object.freeze({
  batch_id: 'clay-2026-07-20',
  lead_count: 32,
  draft_count: 30,
  services: Object.freeze({
    website_design: 12,
    cybersecurity: 9,
    systems_automation: 7,
    compliance_cmmc: 4,
  }),
  average_fit_score: 81,
  samples: Object.freeze([
    Object.freeze({
      company_name: 'Acme Plumbing',
      subject: 'A practical website update',
      preview: 'Alex, I noticed your site could use a refresh…',
    }),
    Object.freeze({
      company_name: 'Secure Co',
      subject: 'A quick security check-in',
      preview: 'Pat, small businesses often wait until after an incident…',
    }),
    Object.freeze({
      company_name: 'Auto Systems',
      subject: 'Cut the spreadsheet handoffs',
      preview: 'Sam, disconnected tools slow down intake…',
    }),
    Object.freeze({
      company_name: 'Should Not Appear',
      subject: 'Fourth sample',
      preview: 'This fourth preview must not appear in Slack.',
    }),
  ]),
  dashboard_path:
    '/dashboard/marketing-agents?category=clay_leads&batch_id=clay-2026-07-20',
});

function findAction(message, actionId) {
  for (const block of message.blocks) {
    if (block.type !== 'actions') continue;
    for (const element of block.elements ?? []) {
      if (element.action_id === actionId) return element;
    }
  }
  return null;
}

test('buildClaySlackMessage returns a JSON-safe Block Kit contract', () => {
  const message = buildClaySlackMessage(SUMMARY);
  const serialized = JSON.stringify(message);
  const roundTrip = JSON.parse(serialized);

  assert.equal(typeof message.text, 'string');
  assert.ok(Array.isArray(message.blocks));
  assert.deepEqual(roundTrip, message);
  assert.match(serialized, /30/);
  assert.match(serialized, /81/);
  assert.match(serialized, /website_design/);
  assert.match(serialized, /cybersecurity/);
  assert.match(serialized, /systems_automation/);
  assert.match(serialized, /compliance_cmmc/);
  assert.match(serialized, /Acme Plumbing/);
  assert.match(serialized, /A practical website update/);
  assert.match(serialized, /Alex, I noticed/);
  assert.match(
    serialized,
    /\/dashboard\/marketing-agents\?category=clay_leads&batch_id=clay-2026-07-20/,
  );
  assert.doesNotMatch(serialized, /Should Not Appear/);
  assert.doesNotMatch(serialized, /Fourth sample/);
});

test('approve and reject actions carry only batch ID and action metadata', () => {
  const message = buildClaySlackMessage(SUMMARY);
  const approve = findAction(message, 'clay_batch_approve');
  const reject = findAction(message, 'clay_batch_reject');

  assert.ok(approve, 'missing clay_batch_approve');
  assert.ok(reject, 'missing clay_batch_reject');

  const approveMeta = JSON.parse(approve.value);
  const rejectMeta = JSON.parse(reject.value);

  assert.deepEqual(Object.keys(approveMeta).sort(), ['action', 'batch_id']);
  assert.deepEqual(Object.keys(rejectMeta).sort(), ['action', 'batch_id']);
  assert.deepEqual(approveMeta, { batch_id: 'clay-2026-07-20', action: 'approve' });
  assert.deepEqual(rejectMeta, { batch_id: 'clay-2026-07-20', action: 'reject' });
});

test('buildClaySlackMessage is pure and never embeds full email bodies', () => {
  const fullBody =
    'FULL_EMAIL_BODY_MARKER: This is a complete email that must never leak into Slack.';
  const summary = {
    ...SUMMARY,
    samples: [
      {
        company_name: 'Leak Check',
        subject: 'Subject only',
        preview: 'Short preview only.',
        body: fullBody,
      },
    ],
  };

  const before = structuredClone(summary);
  const message = buildClaySlackMessage(summary);
  const serialized = JSON.stringify(message);

  assert.deepEqual(summary, before);
  assert.match(serialized, /Short preview only/);
  assert.doesNotMatch(serialized, /FULL_EMAIL_BODY_MARKER/);
  assert.equal(message.blocks.filter((b) => b.type === 'actions').length, 1);
});
