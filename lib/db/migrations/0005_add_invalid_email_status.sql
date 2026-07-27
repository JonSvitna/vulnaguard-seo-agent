-- Widen the real-only status enum to add 'invalid_email', produced by Phase 2's
-- new Validate step (lib/marketing/validate-email.ts). See lib/domain/status.ts.

ALTER TABLE leads DROP CONSTRAINT leads_status_check;
ALTER TABLE leads ADD CONSTRAINT leads_status_check
  CHECK (status IN ('discovered','no_email','invalid_email','qualified','disqualified',
                     'rejected','drafted','approved','sent','unsubscribed','replied'));
