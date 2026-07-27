-- Enforce the real-only status enums from lib/domain/status.ts at the DB
-- level. Values here must match LEAD_STATUSES / EMAIL_STATUSES exactly —
-- when a future phase adds a new real state, widen these constraints in
-- that phase's own migration rather than editing this file.

ALTER TABLE leads ADD CONSTRAINT leads_status_check
  CHECK (status IN ('discovered','no_email','qualified','disqualified',
                     'rejected','drafted','approved','sent','unsubscribed','replied'));

ALTER TABLE emails ADD CONSTRAINT emails_status_check
  CHECK (status IN ('drafted','sending','sent','cancelled'));
