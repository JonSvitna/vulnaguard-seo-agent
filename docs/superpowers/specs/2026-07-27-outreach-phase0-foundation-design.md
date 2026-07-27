# Vulnaguard Outreach — Phase 0: Foundation & Cleanup

## Context

This is phase 1 of an 8-phase rebuild of `vulnaguard-seo-agent` into a
dedicated email outreach ops product, "Vulnaguard Outreach." The full
target spec (product name, navigation, pages, status models, API surface,
database requirements, sending safety, webhooks, reply detection, testing)
was provided by the user in one large brief. That brief was decomposed into
8 phases, each getting its own design → plan → implementation cycle:

0. **Foundation & cleanup (this spec)**
1. Data model normalization + migrations
2. Import → Validate → Qualify → Draft → Approval Queue
3. Scheduling + worker + send-safety + Outbox
4. Webhooks + email event timeline
5. Replies + Suppression
6. Settings + Health + Overview dashboard
7. Test suite + Definition-of-Done end-to-end walkthrough

## Decisions (user-approved)

1. **Incremental normalization, not a rewrite.** The existing send-batch
   worker ([lib/send-batch.ts](../../../lib/send-batch.ts)), transactional
   approval ([lib/marketing/batch-approval.ts](../../../lib/marketing/batch-approval.ts)),
   and transactional drafting ([lib/marketing/draft-leads.ts](../../../lib/marketing/draft-leads.ts))
   are safe and covered by existing `.test.mjs` suites. Later phases will
   *add* the spec's tables/state machines around this logic, not replace it.
2. **Add a real migration system**, replacing lazy `ensureSchema()`
   auto-init going forward.
3. **Remove the Content Pipeline feature entirely** (routes, UI, DB table,
   agent). It's out of scope for an outreach-only product. This leaves a
   stale entry in the `Vulnaguard-AIS-OS` drafting router
   (`connections.md` / `CLAUDE.md` rows referencing `content-pipeline`) —
   flagged as a follow-up for that repo, not fixed here.
4. **URLs stay as-is this phase** (e.g. `/dashboard/marketing-agents`).
   Route/page restructuring happens naturally as each new page (Approval
   Queue, Outbox, Replies, etc.) is built in its own phase — no renaming
   busywork now.
5. **Sidebar nav stays exactly `Leads / Activity / Settings`** this phase.
   Do not add nav entries for pages that don't exist yet (Overview,
   Approval Queue, Sequences, Outbox, Replies, Suppression) — that violates
   "no buttons that do nothing." Each entry is added in the phase that
   ships its page.

## Scope of this phase

### 1. Rebrand

- [app/layout.tsx](../../../app/layout.tsx): metadata title →
  `"Vulnaguard Outreach"`, description →
  `"AI-assisted lead qualification and email outreach"`.
- [app/(app)/_components/Sidebar.tsx](../../../app/(app)/_components/Sidebar.tsx):
  subtitle `"Lead Outreach"` → `"Outreach"`.
- Grep for remaining "SEO Agent" / "Vulnaguard SEO Agent" user-facing strings
  (test-email subject in `app/api/marketing/test-email/route.ts`, any page
  titles) and update to "Vulnaguard Outreach".
- `package.json` `name`/`description` if present, left as an internal detail
  (not user-facing) — only touched if trivial.

### 2. Remove non-outreach code

**Delete routes:**
- `app/api/agent/` (SEO chat agent)
- `app/api/sessions/` (SEO session persistence)
- `app/api/github/` (site repo file writes)
- `app/api/gsc/` (Search Console proxy)
- `app/api/pexels/` (stock image search)
- `app/api/seo-audit/`
- `app/api/content-pipeline/`
- `app/api/inventory/`

**Delete UI:**
- `components/content-pipeline/` and the `/content-pipeline` page
- `app/(app)/dashboard/marketing-agents/UsagePanel.tsx`'s AI-token-cost and
  funnel-chart sections stay for now (they reflect the leads funnel, not
  SEO) — **not removed this phase**, revisited when Overview (phase 6)
  replaces this panel.

**Delete agent code:**
- `vulnaguard-marketing-agents/agents/content-pipeline/`
- `vulnaguard-marketing-agents/pipeline/` (content-pipeline DB persistence
  layer only — confirm no outreach code lives here before deleting)

**Delete from `lib/agents/registry.ts`:** the `content-pipeline` entry.

**Keep unchanged:** `scout`, `outreach` (qualifier/copywriter/classifier)
agents, `personas` table and seed data, all `app/api/marketing/*` routes,
`lib/send-batch.ts`, `lib/email.ts`, `lib/check-stop-replies.ts`,
`lib/ms365-graph.ts`, `lib/sync-resend-status.ts`, `lib/slack.ts`.

### 3. Migration system

**New directory:** `lib/db/migrations/`, numbered SQL files applied in
order, tracked in a new `schema_migrations` table
(`version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`).

- **`0001_baseline.sql`** — the entire current outreach-relevant schema,
  written as idempotent `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ADD
  COLUMN IF NOT EXISTS` statements, transcribed exactly from the current
  `SCHEMA` const + follow-up `ALTER` calls in
  [lib/db.ts](../../../lib/db.ts) for: `leads`, `sequences`, `emails`,
  `linkedin_messages`, `pipeline_runs`, `agent_config`, `agent_runs`,
  `ai_provider_config`, `prompt_runs`, `personas`. This must be safe to run
  against the existing production Railway DB with zero data loss (pure
  additive `IF NOT EXISTS` — no drops, no renames).
- **`0002_drop_seo_tables.sql`** — `DROP TABLE IF EXISTS sessions,
  messages, results, inventory, content_pipeline_records CASCADE`.
- **`0003_seed_defaults.sql`** — the existing `agent_config` defaults,
  `ai_provider_config` seed rows (dropping the `seo-m1..m6` rows — no
  longer relevant), and the two built-in personas + two voice skills,
  transcribed from the current seed logic in `ensureSchema()`.

**New `lib/db/migrate.ts`:**
```ts
export async function runMigrations(): Promise<{ applied: string[] }>
```
Reads `.sql` files from `lib/db/migrations/` sorted by filename, checks
`schema_migrations` for already-applied versions, runs each unapplied file
inside a single transaction (`BEGIN` / file contents / `INSERT INTO
schema_migrations` / `COMMIT`), rolling back that file on error and
throwing (a failed migration must stop startup, not continue silently).

**Wiring:**
- [instrumentation.ts](../../../instrumentation.ts) `register()` calls
  `runMigrations()` once before the scheduler's `setInterval` starts,
  logging applied versions.
- [lib/db.ts](../../../lib/db.ts): `ensureSchema()` is replaced by a thin
  `getPool()`-based helper that just runs `runMigrations()` once (memoized
  via the existing `global.__pgInit` pattern) — so any route still calling
  `ensureSchema()` continues to work unchanged during this transition. The
  giant inline `SCHEMA` string and seed logic are deleted from `lib/db.ts`
  once fully moved into migration files.

### 4. Shared status-model constants (definitions only)

New `lib/domain/status.ts`:
```ts
export const LEAD_STATUSES = [
  'imported', 'no_email', 'invalid_email', 'ready_to_qualify', 'qualifying',
  'qualified', 'disqualified', 'drafting', 'awaiting_approval', 'approved',
  'active_sequence', 'replied', 'unsubscribed', 'completed', 'failed',
] as const
export type LeadStatus = (typeof LEAD_STATUSES)[number]

export const DRAFT_STATUSES = ['draft', 'awaiting_review', 'approved', 'rejected', 'superseded'] as const
export type DraftStatus = (typeof DRAFT_STATUSES)[number]

export const EMAIL_STATUSES = [
  'draft', 'approved', 'scheduled', 'processing', 'sent', 'delivered',
  'opened', 'clicked', 'replied', 'bounced', 'complained', 'cancelled', 'failed',
] as const
export type EmailStatus = (typeof EMAIL_STATUSES)[number]

export const JOB_STATUSES = ['queued', 'processing', 'completed', 'retrying', 'failed', 'cancelled', 'dead_letter'] as const
export type JobStatus = (typeof JOB_STATUSES)[number]
```
This phase only **defines** these — no columns migrate onto them yet, no
existing code changes behavior. Phase 1 (data model normalization) is
where `leads.status` etc. actually adopt these values via a data migration.

## Out of scope (future phases)

New tables (`email_events`, `replies`, `suppressions`, `sequence`
templates/steps, `background_jobs`, `system_settings`, `audit_events`),
new pages (Overview, Approval Queue, Sequences, Outbox, Replies,
Suppression List), webhook handling, reply classification, Settings
reorganization, and the automated test suite from spec section 22.

## Testing

- `npx tsc --noEmit`
- `npm run lint`
- `npm run build`
- Run existing `lib/**/*.test.mjs` suite — must remain green (proves the
  worker/approval/draft logic is untouched).
- Manual: start the app locally against a copy of the real DB (or a fresh
  one), confirm migration log shows `0001_baseline`, `0002_drop_seo_tables`,
  `0003_seed_defaults` applied in order and `schema_migrations` has 3 rows.
  Confirm the Leads page still loads real data, a test email still sends,
  and `/api/agent`, `/api/content-pipeline`, `/content-pipeline` all 404.

## Follow-up (tracked, not done here)

- Update `Vulnaguard-AIS-OS/connections.md` and the drafting-router section
  of `CLAUDE.md`/`AGENTS.md` to remove the stale `content-pipeline`
  reference once this phase ships.
