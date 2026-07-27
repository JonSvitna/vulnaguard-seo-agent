# Phase 2: Import → Validate → Qualify → Draft → Approval Queue

## Context

Phase 2 was originally scoped as "Import → Validate → Qualify → Draft → Approval Queue." Investigation
(via full read of the import/qualify/draft/approval code paths) found that Import, Qualify, Draft, and
Approval Queue already exist and work in production today:

- Import: `app/api/marketing/leads/import-file+import-confirm/route.ts` (CSV/XLSX), `app/api/marketing/scout/import/route.ts`
  (raw-text extraction), `app/api/marketing/leads/clay-batch/route.ts` (Clay/Origami webhook).
- Qualify: `lib/marketing/qualify.ts`'s `qualifyAndUpdateLead()`.
- Draft: `lib/marketing/draft-leads.ts`'s `draftLeadIds()`, plus inline duplicate logic in
  `app/api/marketing/leads/[id]/run-ai/route.ts` and `app/api/marketing/pipeline/run/route.ts`.
- Approval Queue: a fully built tab in `app/(app)/dashboard/marketing-agents/page.tsx`, backed by
  `lib/marketing/batch-approval.ts` and `app/api/marketing/approval/*` routes.

The one genuinely missing piece is **Validate**: no email format check exists on the CSV or scout import
paths. `qualify.ts` only checks for a present/empty email (`no_email`), never a badly-formatted one. Only
the Clay-batch webhook validates format today, via `normalizeClayLead`'s regex (which rejects the whole
payload row rather than tagging a lead status).

Additionally, the qualify→draft "persist sequence/emails/linkedin, advance lead to `drafted`" SQL block is
duplicated verbatim across 3 places: `draft-leads.ts`, `run-ai/route.ts`, `pipeline/run/route.ts`.

## Decisions

1. **Validation is syntax/format-only.** No MX record lookup, no paid verification API (NeverBounce,
   ZeroBounce, etc.) — confirmed explicitly with the user. Reuses the existing regex + domain-shape logic
   already proven in `lib/marketing/clay-batch.ts`.
2. **New real lead status: `invalid_email`.** Added to `LEAD_STATUSES` in `lib/domain/status.ts` and the
   `leads_status_check` CHECK constraint, widened via a new migration — per the Phase 1 rule that new
   states are added only in the phase that actually produces them.
3. **Validate runs at import time**, immediately after insert, in `import-confirm/route.ts` and
   `scout/import/route.ts` — mirroring the existing `externallyRejected` short-circuit pattern already in
   both routes. A lead with a non-empty but badly-formatted email is set to `invalid_email` and excluded
   from `qualifyAndUpdateLead` (never enters the `discovered` scoring pool). `qualify.ts`'s existing
   presence-only check is untouched — it still catches truly empty emails as `no_email`.
4. **Draft-logic consolidation is surgical, not a single mega-function.** The 3 call sites do genuinely
   different orchestration before drafting (single-lead + persona/skill overrides vs. batch loop with
   `pipeline_runs` logging vs. no-qualify-at-all for non-CMMC business lines). Merging all of that into one
   function would just replace duplication with branching flags. Instead, only the literally-duplicated
   persistence block — delete old sequence, insert sequence/emails/linkedin_messages, advance lead to
   `'drafted'` — is extracted into one new exported function, `persistDraftedSequence()`, in
   `lib/marketing/draft-leads.ts`. All 3 sites call it instead of hand-rolling the SQL.
5. **UI**: add `invalid_email` to `STATUS_OPTIONS` and the `statusColor()` map in
   `marketing-agents/page.tsx`, matching how `no_email` is already surfaced.
6. **`RESEND_API_KEY` not set** is confirmed as an operational/Railway environment variable gap, not a code
   defect — explicitly out of scope for this phase, flagged to the user separately as an action item.

## Scope

### New file: `lib/marketing/validate-email.ts`

```ts
// Shared, non-throwing email format validation. Syntax/domain-shape only —
// no MX lookup, no external verification API (explicit product decision,
// see docs/superpowers/specs/2026-07-27-import-validate-draft-consolidation-design.md).
// lib/marketing/clay-batch.ts imports these instead of keeping its own copy.

export function isValidDomain(value: string): boolean {
  if (value.length > 253 || value.endsWith('.') || value.includes('..')) return false
  const labels = value.split('.')
  if (labels.length < 2 || labels.every((label) => /^\d+$/.test(label))) return false
  return labels.every(
    (label) => label.length > 0 && label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label),
  )
}

export function isValidEmailFormat(value: string): boolean {
  const email = value.trim().toLowerCase()
  const atIndex = email.lastIndexOf('@')
  if (atIndex <= 0) return false
  const localPart = email.slice(0, atIndex)
  const domain = email.slice(atIndex + 1)
  const dotAtom = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/i
  return localPart.length <= 64 && email.length <= 254 && dotAtom.test(localPart) && isValidDomain(domain)
}
```

`lib/marketing/clay-batch.ts`'s `normalizeEmail`/`normalizeDomain` import `isValidDomain` from this module
and `normalizeEmail` calls `isValidEmailFormat` instead of re-checking the regex inline (still throws on
failure — its contract doesn't change, only where the check lives).

### New migration: `lib/db/migrations/0005_add_invalid_email_status.sql`

```sql
-- Widen the real-only status enum to add 'invalid_email', produced by Phase 2's
-- new Validate step (lib/marketing/validate-email.ts). See lib/domain/status.ts.

ALTER TABLE leads DROP CONSTRAINT leads_status_check;
ALTER TABLE leads ADD CONSTRAINT leads_status_check
  CHECK (status IN ('discovered','no_email','invalid_email','qualified','disqualified',
                     'rejected','drafted','approved','sent','unsubscribed','replied'));
```

### `lib/domain/status.ts`

Add `'invalid_email'` to `LEAD_STATUSES` (placed next to `'no_email'`), update the doc comment reference
to point at the new migration file.

### `app/api/marketing/leads/import-confirm/route.ts` and `app/api/marketing/scout/import/route.ts`

After insert, before the qualify `.map()`: for each inserted lead with a non-empty `contact_email` that
fails `isValidEmailFormat`, set `status = 'invalid_email'` (single `UPDATE ... WHERE id = $1`) and exclude
it from the qualify step the same way `externallyRejected` is excluded today. Add an `invalid_email_count`
field to the `pipeline_runs` details JSON and the route's JSON response, alongside the existing
`qualified`/`disqualified` counts.

### `lib/marketing/draft-leads.ts`

Extract a new exported function:

```ts
export async function persistDraftedSequence(
  leadId: number,
  draft: CopywriterResult,
  transactionQuery: Query,
): Promise<void> {
  await transactionQuery(`DELETE FROM sequences WHERE lead_id = $1`, [leadId])
  const sequences = await transactionQuery<{ id: number }>(
    `INSERT INTO sequences (lead_id, status) VALUES ($1, 'drafted') RETURNING id`,
    [leadId],
  )
  const sequenceId = sequences[0].id
  for (const email of draft.emails) {
    await transactionQuery(
      `INSERT INTO emails (sequence_id, lead_id, touch_number, subject, body, status, flagged_reason)
       VALUES ($1, $2, $3, $4, $5, 'drafted', $6)`,
      [sequenceId, leadId, email.touch_number, email.subject, email.body, email.flagged_reason ?? null],
    )
  }
  if (draft.linkedin_message?.trim()) {
    await transactionQuery(
      `INSERT INTO linkedin_messages (sequence_id, lead_id, message, status)
       VALUES ($1, $2, $3, 'drafted')`,
      [sequenceId, leadId, draft.linkedin_message],
    )
  }
  await transactionQuery(
    `UPDATE leads SET status = 'drafted', updated_at = NOW()
     WHERE id = $1 AND status IN ('discovered', 'qualified')`,
    [leadId],
  )
}
```

`draftLeadIds()`'s internal transaction body calls this instead of its inline block. The final
`UPDATE ... WHERE id = $1 AND status = 'discovered'` becomes `AND status IN ('discovered', 'qualified')`
so the same helper works for both the draft-only path (still `discovered`) and the qualify-then-draft path
(now `qualified` by the time it drafts) — this is the one small behavior widening needed to make the
helper shared; it does not allow drafting from any other status.

### `app/api/marketing/leads/[id]/run-ai/route.ts` and `app/api/marketing/pipeline/run/route.ts`

Replace the inline delete/insert/insert/insert/update block with a call to
`persistDraftedSequence(leadId, draft, query)` (both already have a `query` function in scope; no
transaction wrapping today in these routes, so behavior is unchanged — same non-transactional `query` calls,
just centralized).

### `app/(app)/dashboard/marketing-agents/page.tsx`

- `STATUS_OPTIONS`: add `"invalid_email"` after `"no_email"`.
- `statusColor()`: add `invalid_email: "#C94C4C"` (reuse the same red as `unsubscribed`, signaling "dead
  end, not actionable" — distinct from `no_email`'s orange which is a softer "missing data" signal).

## Risk

- The CHECK constraint migration is additive/same-shape as Phase 1's `0004` — low risk, transactional,
  rolls back safely on failure (per the established migration pattern).
- `import-confirm`/`scout/import` are high-traffic ingestion paths; adding a status-update call and an
  exclusion check mirrors the already-proven `externallyRejected` pattern in the same files, minimizing new
  surface area.
- `persistDraftedSequence`'s status-guard widening (`'discovered'` → `IN ('discovered','qualified')`) is the
  only behavior change to shared logic — reviewed carefully since it's used by all 3 call sites, including
  the interactive single-lead "Run AI" button.

## Out of scope

MX/deliverability checks, paid email verification APIs, Approval Queue UI changes, `sequences.status`
widening, `RESEND_API_KEY` (operational/Railway config, not code).

## Testing

`get_errors` on all touched files; manual Railway deploy log check for the new migration (same process
validated in Phase 1 — check for `[db] applied migrations: ...]` including the new file, and confirm no
migration-failure healthcheck crash).
