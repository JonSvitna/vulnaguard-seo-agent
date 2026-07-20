# Clay Batch Review and Slack Approval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Source and qualify U.S. small-business leads in Clay each morning, draft the strongest enriched leads in the existing Vulnaguard SEO Agent pipeline, and let Sean approve each batch from the dashboard or Slack.

**Architecture:** Clay owns the 6:00 AM Eastern source, fit classification, and conditional enrichment. n8n receives qualified rows, forwards them to one authenticated SEO Agent ingestion API, finalizes the batch at 7:00 AM Eastern, notifies `#clay-leads`, and verifies/dispatches Slack interactions. The SEO Agent remains the only lead, sequence, approval, and send source of truth.

**Tech Stack:** Clay, n8n, Next.js 16 App Router, TypeScript, PostgreSQL, Node test runner, Slack Block Kit, Resend.

---

## Guardrails

- No second lead database or approval queue in n8n, Clay, or Slack.
- No manual-run path in this phase.
- Clay enriches contacts only after `fit_score >= 70`.
- Slack never sends email directly. It invokes the same SEO Agent approval service as the dashboard.
- Preserve the current Vulnaguard sender, signature, unsubscribe footer, suppression checks, and Resend pipeline.
- Make intake, approval, and rejection idempotent.
- Preserve unrelated worktree changes, especially `app/(app)/dashboard/page.tsx`.

## Repositories

- App: `/Users/seanm/Documents/GitHub/vulnaguard-seo-agent`
- Workflows/docs: `/Users/seanm/Documents/GitHub/Vulnaguard-AIS-OS`

## Task 1: Add Clay Lead Metadata and Validation

**Files:**

- Modify: `lib/db.ts`
- Modify: `lib/config.ts`
- Modify: `vulnaguard-marketing-agents/agents/outreach/types.ts`
- Create: `lib/marketing/clay-batch.ts`
- Create: `lib/marketing/clay-batch.test.mjs`

- [ ] Write failing tests for normalization, service mapping, and the enrichment threshold.

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { CLAY_FIT_THRESHOLD, normalizeClayLead } from './clay-batch.ts';

test('maps a strong website lead to the existing business line', () => {
  const lead = normalizeClayLead({
    clay_row_id: 'row_123',
    batch_id: 'clay-2026-07-20',
    company_name: 'Acme Plumbing',
    website: 'https://acme.example',
    contact_name: 'Alex Smith',
    email: 'alex@acme.example',
    fit_score: 84,
    fit_reason: 'Small local company with an outdated website.',
    recommended_service: 'website_design',
  });
  assert.equal(lead.business_line, 'website_dev');
  assert.equal(lead.category, 'clay_leads');
});

test('rejects rows below threshold', () => {
  assert.throws(() => normalizeClayLead({
    clay_row_id: 'row_124',
    batch_id: 'clay-2026-07-20',
    company_name: 'Mega Corp',
    fit_score: CLAY_FIT_THRESHOLD - 1,
    fit_reason: 'Outside current delivery capacity.',
    recommended_service: 'cybersecurity',
  }), /fit score/i);
});
```

- [ ] Run `node --test lib/marketing/clay-batch.test.mjs`.

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] Implement an allow-listed validator and mapping.

```ts
export const CLAY_FIT_THRESHOLD = 70;
export const CLAY_SERVICE_TO_BUSINESS_LINE = {
  cybersecurity: 'commercial_security',
  compliance_cmmc: 'cmmc',
  website_design: 'website_dev',
  systems_automation: 'systems_automation',
} as const;
```

`normalizeClayLead(input)` must validate required strings, an integer score from 0–100, a supported service, normalized email/domain, and `fit_score >= 70`. Ignore any category/business-line supplied by Clay. Set `category = 'clay_leads'` and derive the business line.

- [ ] Extend `OutreachLead` with nullable `batch_id`, `source_detail`, `fit_score`, `fit_reason`, and `recommended_service`.

- [ ] Add additive migrations in `ensureSchema()`.

```sql
ALTER TABLE leads ADD COLUMN IF NOT EXISTS batch_id TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS source_detail TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS fit_score INTEGER;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS fit_reason TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS recommended_service TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS external_source_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS leads_source_external_id_uidx
  ON leads (source, external_source_id)
  WHERE external_source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS leads_batch_id_idx ON leads (batch_id);
```

- [ ] Add `clay_fit_min_score: '70'` to existing defaults.

- [ ] Run the test again. Expected: PASS.

- [ ] Commit.

```bash
git add lib/db.ts lib/config.ts lib/marketing/clay-batch.ts lib/marketing/clay-batch.test.mjs vulnaguard-marketing-agents/agents/outreach/types.ts
git commit -m "feat: add Clay batch lead metadata"
```

## Task 2: Add Systems-Automation Drafting

**Files:**

- Modify: `vulnaguard-marketing-agents/agents/outreach/index.ts`
- Create: `vulnaguard-marketing-agents/agents/outreach/systems-automation.test.mjs`

- [ ] Write a failing test against a pure prompt-selection helper:

```js
assert.match(prompt, /workflow|automation|system/i);
assert.doesNotMatch(prompt, /CMMC|C3PAO|DoD contractor/i);
```

- [ ] Extract/export prompt selection if it is currently embedded in `draftSequence`.

- [ ] Add `systems_automation: 3` to `TOUCH_COUNT`.

- [ ] Add explicit small-business systems positioning: repetitive handoffs, disconnected tools, manual intake, spreadsheet-heavy work, and a short workflow-review CTA. Prohibit guaranteed savings and enterprise-scale claims.

- [ ] Run:

`node --test vulnaguard-marketing-agents/agents/outreach/systems-automation.test.mjs lib/marketing/*.test.mjs`

Expected: PASS.

- [ ] Commit:

```bash
git add vulnaguard-marketing-agents/agents/outreach
git commit -m "feat: add systems automation outreach drafting"
```

## Task 3: Extract a Reusable Drafting Service

**Files:**

- Create: `lib/marketing/draft-leads.ts`
- Create: `lib/marketing/draft-leads.test.mjs`
- Modify: `app/api/marketing/pipeline/draft-only/route.ts`

- [ ] Write dependency-injected failing tests proving:

  - only eligible, unsuppressed leads draft;
  - already-drafted leads skip;
  - the business line reaches `draftSequence`;
  - sequence/email records stay in the current database;
  - partial failure returns per-lead results and does not redraft successes.

- [ ] Move the route's reusable loop into:

```ts
export async function draftLeadIds(
  leadIds: number[],
  deps: DraftLeadDependencies = productionDependencies,
): Promise<DraftLeadResult[]> {
  // Preserve existing qualification, suppression, draft, sequence, and email behavior.
}
```

- [ ] Keep `draft-only/route.ts` as a thin wrapper.

- [ ] Run `npx tsx --test lib/marketing/draft-leads.test.mjs` and `npm run lint`.

Expected: PASS and no new lint errors.

- [ ] Commit:

```bash
git add lib/marketing/draft-leads.ts lib/marketing/draft-leads.test.mjs app/api/marketing/pipeline/draft-only/route.ts
git commit -m "refactor: share marketing lead drafting service"
```

## Task 4: Build the Authenticated Clay Intake API

**Files:**

- Create: `lib/marketing/service-auth.ts`
- Create: `lib/marketing/service-auth.test.mjs`
- Create: `app/api/marketing/leads/clay-batch/route.ts`
- Create: `app/api/marketing/leads/clay-batch/route.test.mjs`
- Modify: `.env.example`

- [ ] Write failing authentication tests for missing, malformed, incorrect, and correct `Authorization: Bearer test-automation-secret` headers while the test environment sets `MARKETING_AUTOMATION_SECRET=test-automation-secret`. Compare tokens with `crypto.timingSafeEqual`.

- [ ] Write failing route tests:

  - valid row creates one lead and drafts;
  - repeated `source=clay + external_source_id` returns the same lead;
  - unsupported service, malformed email, and score below threshold return 400;
  - duplicate intake never duplicates sequences;
  - database/drafting failure returns a retryable 500.

- [ ] Implement `POST /api/marketing/leads/clay-batch`.

```json
{
  "clay_row_id": "row_123",
  "batch_id": "clay-2026-07-20",
  "company_name": "Acme Plumbing",
  "website": "https://acme.example",
  "contact_name": "Alex Smith",
  "title": "Owner",
  "email": "alex@acme.example",
  "location": "Baltimore, MD",
  "fit_score": 84,
  "fit_reason": "Small local company with an outdated website.",
  "recommended_service": "website_design"
}
```

Set `source='clay'`, `source_detail='scheduled_clay_table'`, and `external_source_id=clay_row_id`. Call `draftLeadIds([leadId])` only after a successful insert.

Response:

```json
{"ok":true,"created":true,"lead_id":123,"batch_id":"clay-2026-07-20","sequence_ids":[456]}
```

- [ ] Add only the secret name to `.env.example`.

- [ ] Run:

```bash
node --test lib/marketing/service-auth.test.mjs app/api/marketing/leads/clay-batch/route.test.mjs
npm run build
```

Expected: tests pass and production build succeeds.

- [ ] Commit:

```bash
git add .env.example lib/marketing/service-auth.ts lib/marketing/service-auth.test.mjs app/api/marketing/leads/clay-batch
git commit -m "feat: ingest and draft qualified Clay leads"
```

## Task 5: Add Batch Summary and Shared Approval

**Files:**

- Create: `lib/marketing/batch-approval.ts`
- Create: `lib/marketing/batch-approval.test.mjs`
- Create: `app/api/marketing/clay-batches/[batchId]/route.ts`
- Modify: `app/api/marketing/approval/approve/route.ts`
- Modify: `app/api/marketing/approval/reject/route.ts`
- Modify: `app/api/marketing/approval/pending/route.ts`

- [ ] Write failing tests for summary counts/sample drafts, batch approval, batch rejection, replay safety, terminal-state protection, and exactly one send-runner call after approval.

- [ ] Implement:

```ts
export async function getClayBatchSummary(batchId: string): Promise<ClayBatchSummary>;
export async function approveClayBatch(batchId: string): Promise<BatchActionResult>;
export async function rejectClayBatch(batchId: string): Promise<BatchActionResult>;
```

Use a transaction to select only `drafted` sequences and transition state. Reuse the existing schedule/send behavior.

- [ ] Add authenticated `GET /api/marketing/clay-batches/:batchId` returning:

```json
{
  "batch_id": "clay-2026-07-20",
  "lead_count": 32,
  "draft_count": 30,
  "services": {"website_design":12,"cybersecurity":9,"systems_automation":7,"compliance_cmmc":4},
  "average_fit_score": 81,
  "samples": [{"company_name":"Acme Plumbing","subject":"A practical website update","preview":"Alex, I noticed..."}],
  "dashboard_path": "/dashboard/marketing-agents?category=clay_leads&batch_id=clay-2026-07-20"
}
```

- [ ] Extend approve/reject routes to accept either `{"sequence_ids":[456]}` or `{"batch_id":"clay-2026-07-20"}`, never both or neither. Preserve current explicit-ID callers.

- [ ] Add `category` and `batch_id` filters and Clay fields to the pending response.

- [ ] Run `node --test lib/marketing/batch-approval.test.mjs` and `npm run build`.

- [ ] Commit:

```bash
git add lib/marketing/batch-approval.ts lib/marketing/batch-approval.test.mjs app/api/marketing/clay-batches app/api/marketing/approval
git commit -m "feat: add Clay batch review and approval APIs"
```

## Task 6: Add the Shared Slack Message Contract

**Files:**

- Create: `lib/marketing/clay-slack.ts`
- Create: `lib/marketing/clay-slack.test.mjs`
- Modify: `app/api/marketing/clay-batches/[batchId]/route.ts`

- [ ] Write failing tests for a serializable Slack message contract. Require count, average score, service breakdown, up to three draft previews, dashboard link, and approve/reject action metadata containing only batch ID/action.

- [ ] Implement `buildClaySlackMessage(summary)` as a pure function. Its output must be JSON-safe and contain action IDs `clay_batch_approve` and `clay_batch_reject`.

- [ ] Include the message contract in the authenticated batch-summary response so n8n does not independently invent business copy or action values.

- [ ] Add tests proving message construction has no side effects and exposes no email body beyond the three short previews.

- [ ] Run:

`node --test lib/marketing/clay-slack.test.mjs lib/marketing/batch-approval.test.mjs`

Expected: PASS.

- [ ] Commit:

```bash
git add lib/marketing/clay-slack.ts lib/marketing/clay-slack.test.mjs app/api/marketing/clay-batches
git commit -m "feat: expose Clay batch Slack message contract"
```

## Task 7: Add the Clay Leads Dashboard Category

**Files:**

- Modify: `app/(app)/dashboard/marketing-agents/page.tsx`
- Create: `lib/marketing/clay-dashboard.test.mjs`

- [ ] Write a failing source regression test for `clay_leads`, batch filtering, fit score/reason, recommended service, and batch actions.

- [ ] Add `clay_leads: 'Clay Leads'` to category labels/options.

- [ ] Read `category` and `batch_id` from the URL and pass both to the pending API.

- [ ] Show fit score, recommended service, concise fit reason, website/domain, and batch ID on Clay cards.

- [ ] Add batch-level approve/reject controls using the existing endpoints with `{batch_id}`.

- [ ] Preserve individual approval, send-all, filters, and non-Clay categories.

- [ ] Run:

```bash
node --test lib/marketing/clay-dashboard.test.mjs
npm run lint
npm run build
```

Expected: PASS, no new lint errors, successful build.

- [ ] Commit:

```bash
git add app/'(app)'/dashboard/marketing-agents/page.tsx lib/marketing/clay-dashboard.test.mjs
git commit -m "feat: add Clay batch review to marketing dashboard"
```

## Task 8: Configure n8n Intake and Finalization

**Files:**

- Modify: `/Users/seanm/Documents/GitHub/Vulnaguard-AIS-OS/infra/n8n/clay-lead-intake.workflow.json`
- Create: `/Users/seanm/Documents/GitHub/Vulnaguard-AIS-OS/infra/n8n/clay-lead-finalizer.workflow.json`
- Create: `/Users/seanm/Documents/GitHub/Vulnaguard-AIS-OS/infra/n8n/clay-slack-approval.workflow.json`
- Create: `/Users/seanm/Documents/GitHub/Vulnaguard-AIS-OS/infra/n8n/tests/validate_clay_workflows.mjs`
- Modify: `/Users/seanm/Documents/GitHub/Vulnaguard-AIS-OS/connections.md`

- [ ] Write a failing JSON validation test proving:

  - intake calls `/api/marketing/leads/clay-batch`;
  - secrets are credential/env references, never inline;
  - finalizer timezone is `America/New_York` with cron `0 7 * * *`;
  - finalizer derives `clay-YYYY-MM-DD`, gets summary, and posts Slack blocks;
  - interaction webhook retains the raw request body, verifies Slack HMAC/timestamp, restricts channel/user, acknowledges promptly, and calls only the batch approve/reject endpoint;
  - no workflow node sends email or changes sequence status.

- [ ] Update intake normalization to send only Task 4's allow-listed contract.

- [ ] Configure its HTTP Request:

```text
POST {{$env.SEO_AGENT_BASE_URL}}/api/marketing/leads/clay-batch
Authorization: Bearer {{$env.MARKETING_AUTOMATION_SECRET}}
Content-Type: application/json
```

- [ ] Build the 7:00 AM finalizer:

  1. Schedule Trigger at `0 7 * * *`, `America/New_York`.
  2. Derive today's Eastern `batch_id`.
  3. GET the SEO Agent batch summary.
  4. Post a no-qualified-leads status without buttons when `draft_count=0`.
  5. Otherwise post Block Kit to `SLACK_CLAY_LEADS_CHANNEL_ID`.
  6. Keep Slack message timestamp only in n8n execution output for diagnosis.

- [ ] Build the Slack interaction workflow:

  1. Webhook accepts Slack interactions with raw-body retention enabled.
  2. Reject timestamps more than five minutes old.
  3. Calculate HMAC-SHA256 for `v0:<timestamp>:<rawBody>` with the credential-backed `SLACK_SIGNING_SECRET`, then use a constant-time comparison against `X-Slack-Signature`.
  4. Parse `payload` only after verification.
  5. Require `channel.id == SLACK_CLAY_LEADS_CHANNEL_ID` and `user.id` in `SLACK_CLAY_APPROVER_USER_IDS`.
  6. Acknowledge the interaction before doing downstream work.
  7. Map only `clay_batch_approve` and `clay_batch_reject` to the SEO Agent batch endpoints using the automation bearer credential.
  8. Update the original Slack message with actor/final status; on a downstream error, preserve the review link and show a retryable error.

Configure n8n to permit only the built-in `crypto` module in Code nodes (`NODE_FUNCTION_ALLOW_BUILTIN=crypto`) if the deployed n8n version lacks a native HMAC/constant-time comparison node. The workflow validator must fail if signature, timestamp, channel, or user checks are absent.

- [ ] Run from AIOS:

`node infra/n8n/tests/validate_clay_workflows.mjs`

Expected: PASS.

- [ ] Update `connections.md` with Clay purpose, both workflows, endpoints, `#clay-leads`, secret names, owner, and verification date.

- [ ] Commit in AIOS:

```bash
git add infra/n8n/clay-lead-intake.workflow.json infra/n8n/clay-lead-finalizer.workflow.json infra/n8n/clay-slack-approval.workflow.json infra/n8n/tests/validate_clay_workflows.mjs connections.md
git commit -m "feat: automate Clay intake and Slack batch notices"
```

## Task 9: Configure Clay, Slack, and Production Secrets

**External systems:** Clay workspace/table, Slack app, n8n, deployed SEO Agent.

- [ ] Schedule the Clay source daily at 6:00 AM `America/New_York`.

- [ ] Apply ICP constraints: U.S.; approximately 1–20 employees when data exists; independent/local small organizations across industries; exclude Fortune 500, major health systems, national enterprises, centralized franchises, government-only targeting, and companies outside current delivery capacity.

- [ ] Add Clay AI columns:

  - `fit_score`: integer 0–100;
  - `fit_reason`: one evidence-based sentence;
  - `recommended_service`: exactly `cybersecurity`, `compliance_cmmc`, `website_design`, or `systems_automation`.

- [ ] Run contact/name/title/email enrichment only when `fit_score >= 70`.

- [ ] Start at 25–50 qualified/enriched leads daily. Increase toward 200–300 only after quality, approval, reply, bounce, and unsubscribe metrics support the ramp.

- [ ] Set `batch_id=clay-YYYY-MM-DD` in Eastern time and send qualifying rows to n8n.

- [ ] Enable Slack Interactivity; point its Request URL to the production n8n Slack interaction webhook; confirm the bot is in `#clay-leads` and can post/update messages.

- [ ] Set secrets:

  - SEO Agent: `MARKETING_AUTOMATION_SECRET`;
  - n8n: `SEO_AGENT_BASE_URL`, matching `MARKETING_AUTOMATION_SECRET`, Slack credential, `SLACK_SIGNING_SECRET`, `SLACK_CLAY_LEADS_CHANNEL_ID`, `SLACK_CLAY_APPROVER_USER_IDS`.

- [ ] Activate all three n8n workflows only after endpoint and signed-interaction smoke tests pass.

## Task 10: Verify End to End and Document

**Files:**

- Create: `/Users/seanm/Documents/GitHub/Vulnaguard-AIS-OS/references/clay-lead-automation.md`
- Modify: `/Users/seanm/Documents/GitHub/Vulnaguard-AIS-OS/decisions/log.md`

- [ ] Send 3–5 controlled non-production leads through Clay.

- [ ] Replay the webhook and prove one lead/sequence per Clay row.

- [ ] Verify category, service mapping, Vulnaguard sender/signature/footer, no unrelated CMMC copy, and no pre-approval send.

- [ ] Review `/dashboard/marketing-agents?category=clay_leads&batch_id=clay-test-2026-07-20`.

- [ ] Run finalizer in n8n test mode and verify Slack count, breakdown, average score, samples, dashboard link, and buttons.

- [ ] Reject the first batch twice. Confirm the second action is a no-op and nothing sends.

- [ ] Approve a second batch twice. Confirm Slack actor/status, dashboard state, suppression protection, one send-runner invocation, and no duplicate sends.

- [ ] Run in SEO Agent:

```bash
node --test lib/marketing/*.test.mjs vulnaguard-marketing-agents/agents/outreach/*.test.mjs
npm run lint
npm run build
```

Expected: all tests pass, no new lint errors, successful build.

- [ ] Run in AIOS:

`node infra/n8n/tests/validate_clay_workflows.mjs`

Expected: PASS.

- [ ] Document ownership, 6:00/7:00 timing, contracts, pause/retry procedures, idempotency, secret rotation, failure diagnosis, approval procedure, and volume-ramp criteria in `references/clay-lead-automation.md`.

- [ ] Log the business decision: Clay uses the existing SEO Agent pipeline, requires human approval, and creates no parallel database/direct Slack send.

- [ ] Mirror that business-level decision to the Obsidian vault under the AIOS documentation standard.

- [ ] Commit AIOS documentation:

```bash
git add references/clay-lead-automation.md decisions/log.md
git commit -m "docs: record Clay lead automation operations"
```

## Definition of Done

- Clay starts daily at 6:00 AM Eastern without a manual trigger.
- Only leads scoring 70+ receive paid contact enrichment.
- Qualified leads import and draft idempotently under `clay_leads`.
- n8n finalizes at 7:00 AM Eastern and notifies `#clay-leads`.
- Dashboard and Slack display the same SEO Agent batch state.
- Both approval surfaces call the same approval service and existing send pipeline.
- Nothing sends before approval.
- Replay tests prove no duplicate lead, sequence, or send.
- Tests, lint, build, workflow validation, smoke checks, registry, runbook, and decision record are complete.
