# Vulnaguard Outreach — Phase 1: Status Enum Adoption

## Context

Phase 0 (foundation & cleanup — [2026-07-27-outreach-phase0-foundation-design.md](2026-07-27-outreach-phase0-foundation-design.md))
added `lib/domain/status.ts` as a set of forward-looking status constants,
written *before* cross-checking them against the values the app actually
uses. This spec is Phase 1 of the 8-phase rebuild: "data model
normalization." The user narrowed this phase's scope up front —
**fold the 7 new tables from the original spec (`email_events`, `replies`,
`suppressions`, sequence templates/steps, `background_jobs`,
`system_settings`, `audit_events`) into the phases that actually consume
them**, rather than building all of them now. That leaves Phase 1 as: make
`leads.status` and `emails.status` actually adopt an enforced enum.

## Investigation finding

Grepping every `UPDATE ... SET status = '...'` / status-literal in the
codebase turned up two problems with the Phase-0 draft enum:

1. **Spelling mismatch.** The app already uses `discovered` / `drafted` /
   `sent`; the draft enum invented `imported` / `awaiting_approval` /
   `completed` for the same states. Renaming the app to match would touch
   ~21 files, including a landmine: the literal `'drafted'` is used for
   **both** `sequences.status` (out of scope) and `emails.status`, so a
   blind rename risks corrupting the wrong table.
2. **Missing value.** `rejected` is a real, actively-used `leads.status`
   and `sequences.status` value (set by
   [lib/marketing/batch-approval.ts](../../../lib/marketing/batch-approval.ts)'s
   `rejectSequenceIds`/`rejectClayBatch` and
   [lib/marketing/external-dedup.ts](../../../lib/marketing/external-dedup.ts))
   that the Phase-0 draft enum omitted entirely.

## Decisions (user-approved)

1. **Fix the enum to match reality, not the other way around.** Zero
   application code changes this phase — `lib/domain/status.ts` is edited
   to reflect the values already in production use.
2. **`leads.status` and `emails.status` get DB-level `CHECK` constraints**
   enforcing the (corrected) enum going forward. `sequences.status` gets no
   constraint this phase — that table is likely to be restructured when a
   later phase introduces sequence templates/steps, so its vocabulary isn't
   worth freezing now.
3. **Enum lists stay real-only, not aspirational.** Speculative states from
   the original 8-phase target spec that nothing produces yet (e.g.
   `invalid_email`, `ready_to_qualify`, `awaiting_approval`,
   `active_sequence`) are dropped from the lists rather than pre-added.
   Each future phase that introduces a new real state (e.g. Phase 2's
   Import → Validate step) adds it to the array *and* widens the `CHECK`
   constraint in its own migration, at the time it actually ships that
   state. This keeps the enum always in sync with what the app does.

## Scope of this phase

### 1. `lib/domain/status.ts`

```ts
export const LEAD_STATUSES = [
  'discovered', 'no_email', 'qualified', 'disqualified', 'rejected',
  'drafted', 'approved', 'sent', 'unsubscribed', 'replied',
] as const
export type LeadStatus = (typeof LEAD_STATUSES)[number]

export const EMAIL_STATUSES = ['drafted', 'sending', 'sent', 'cancelled'] as const
export type EmailStatus = (typeof EMAIL_STATUSES)[number]
```

`replied` is kept even though no code path sets it yet today — it's
already a live filter option in
[app/(app)/dashboard/marketing-agents/page.tsx](../../../app/(app)/dashboard/marketing-agents/page.tsx)'s
`STATUS_OPTIONS`, so the constraint must permit it. `DRAFT_STATUSES` and
`JOB_STATUSES` are untouched — no backing table consumes them yet.

### 2. New migration: `lib/db/migrations/0004_status_constraints.sql`

```sql
ALTER TABLE leads ADD CONSTRAINT leads_status_check
  CHECK (status IN ('discovered','no_email','qualified','disqualified',
                     'rejected','drafted','approved','sent','unsubscribed','replied'));

ALTER TABLE emails ADD CONSTRAINT emails_status_check
  CHECK (status IN ('drafted','sending','sent','cancelled'));
```

Idempotent per the existing migration-runner contract (each file only ever
runs once, tracked in `schema_migrations`) — no `IF NOT EXISTS` needed for
constraint DDL since the runner itself prevents re-application.

### 3. No application code changes

Every route/lib file that reads or writes these status literals keeps its
existing strings unchanged (`discovered`, `drafted`, `sent`, `no_email`,
`qualified`, `disqualified`, `rejected`, `unsubscribed`, `sending`,
`cancelled` all continue to mean exactly what they mean today).

## Risk

Adding a `CHECK` constraint scans existing rows. This finding is based on a
static code review, not a query against the live production DB — if any
historic row holds a status value outside these lists (stray typo, old
test data), the `ALTER TABLE` will fail. That's a safe failure mode: the
migration runner rolls back that single file transactionally and throws,
so startup stops cleanly rather than corrupting data. If it happens, the
fix is to add the discovered value to both the TS array and the `CHECK`
list in a follow-up migration.

## Out of scope (future phases)

- `sequences.status` enum/constraint (revisit when sequence
  templates/steps are introduced).
- Any new tables (`email_events`, `replies`, `suppressions`,
  `background_jobs`, `system_settings`, `audit_events`) — each is added in
  the phase that consumes it, per the user's scoping decision.
- Adding not-yet-real states (`invalid_email`, `ready_to_qualify`,
  `awaiting_approval`, `active_sequence`, etc.) — added when the phase that
  produces them ships.

## Testing

- `get_errors` across the repo (TS/ESLint diagnostics) — `tsc`/`build`/
  `npm run test` cannot be run from this environment (node/npm/npx not on
  PATH in this terminal); ask the user to run `npm run build` and
  `npm run test` locally to confirm.
- Manual: after deploy, confirm `schema_migrations` gains a
  `0004_status_constraints` row and the Leads page / send flow still work
  unchanged.
