// Shared status-model constants for the outreach product. This phase only
// defines these enums — no columns migrate onto them yet, no existing
// code changes behavior. Phase 1 (data model normalization) is where
// `leads.status` etc. actually adopt these values via a data migration.

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
