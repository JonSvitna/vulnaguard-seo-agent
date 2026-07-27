// Shared status-model constants for the outreach product.
//
// `LEAD_STATUSES` and `EMAIL_STATUSES` are real-only — they list exactly
// the values `leads.status` / `emails.status` are ever set to today, and
// are enforced at the DB level by `lib/db/migrations/0004_status_constraints.sql`.
// When a future phase introduces a new real state (e.g. Phase 2's
// Import → Validate step), add it here *and* widen the CHECK constraint in
// that phase's own migration — don't pre-add speculative states.
//
// `DRAFT_STATUSES` / `JOB_STATUSES` are forward-looking placeholders with
// no backing table yet (added when a `drafts`/`background_jobs` table is
// introduced in a later phase).

export const LEAD_STATUSES = [
  'discovered', 'no_email', 'qualified', 'disqualified', 'rejected',
  'drafted', 'approved', 'sent', 'unsubscribed', 'replied',
] as const
export type LeadStatus = (typeof LEAD_STATUSES)[number]

export const DRAFT_STATUSES = ['draft', 'awaiting_review', 'approved', 'rejected', 'superseded'] as const
export type DraftStatus = (typeof DRAFT_STATUSES)[number]

export const EMAIL_STATUSES = ['drafted', 'sending', 'sent', 'cancelled'] as const
export type EmailStatus = (typeof EMAIL_STATUSES)[number]

export const JOB_STATUSES = ['queued', 'processing', 'completed', 'retrying', 'failed', 'cancelled', 'dead_letter'] as const
export type JobStatus = (typeof JOB_STATUSES)[number]
