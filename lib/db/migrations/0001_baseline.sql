-- Baseline schema for the outreach-relevant tables, transcribed exactly
-- from the previous lib/db.ts SCHEMA const + follow-up ALTER statements.
-- Pure additive (IF NOT EXISTS everywhere) — safe to run against the
-- existing production database with zero data loss.

CREATE TABLE IF NOT EXISTS leads (
  id SERIAL PRIMARY KEY,
  company_name TEXT NOT NULL,
  website TEXT,
  location TEXT,
  org_type TEXT,
  cmmc_level_sought TEXT,
  employee_count TEXT,
  contact_name TEXT,
  contact_title TEXT,
  contact_email TEXT,
  contact_linkedin TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  status TEXT NOT NULL DEFAULT 'discovered',
  score INTEGER NOT NULL DEFAULT 0,
  score_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads (status);
CREATE INDEX IF NOT EXISTS idx_leads_updated_at ON leads (updated_at DESC);

CREATE TABLE IF NOT EXISTS sequences (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'drafted',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  approved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_sequences_lead_id ON sequences (lead_id);
CREATE INDEX IF NOT EXISTS idx_sequences_status ON sequences (status);

CREATE TABLE IF NOT EXISTS emails (
  id SERIAL PRIMARY KEY,
  sequence_id INTEGER NOT NULL REFERENCES sequences(id) ON DELETE CASCADE,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  touch_number INTEGER NOT NULL,
  subject TEXT,
  body TEXT,
  channel TEXT NOT NULL DEFAULT 'email',
  status TEXT NOT NULL DEFAULT 'drafted',
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_emails_sequence_id ON emails (sequence_id);

CREATE TABLE IF NOT EXISTS linkedin_messages (
  id SERIAL PRIMARY KEY,
  sequence_id INTEGER NOT NULL REFERENCES sequences(id) ON DELETE CASCADE,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'drafted'
);
CREATE INDEX IF NOT EXISTS idx_linkedin_messages_sequence_id ON linkedin_messages (sequence_id);

CREATE TABLE IF NOT EXISTS pipeline_runs (
  id SERIAL PRIMARY KEY,
  agent TEXT NOT NULL,
  status TEXT NOT NULL,
  leads_processed INTEGER NOT NULL DEFAULT 0,
  details JSONB,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_started_at ON pipeline_runs (started_at DESC);

CREATE TABLE IF NOT EXISTS agent_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_runs (
  id SERIAL PRIMARY KEY,
  agent_name TEXT NOT NULL,
  status TEXT NOT NULL,
  input JSONB,
  output JSONB,
  error TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_agent_runs_started_at ON agent_runs (started_at DESC);

CREATE TABLE IF NOT EXISTS ai_provider_config (
  agent_name TEXT PRIMARY KEY,
  provider   TEXT NOT NULL DEFAULT 'openai',
  model      TEXT NOT NULL DEFAULT 'gpt-4o',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS prompt_runs (
  id SERIAL PRIMARY KEY,
  agent_name TEXT NOT NULL,
  lead_id INTEGER,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  system_prompt TEXT,
  user_prompt TEXT,
  response TEXT,
  status TEXT NOT NULL,
  error TEXT,
  duration_ms INTEGER,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_prompt_runs_lead_id ON prompt_runs (lead_id);
CREATE INDEX IF NOT EXISTS idx_prompt_runs_started_at ON prompt_runs (started_at DESC);

CREATE TABLE IF NOT EXISTS personas (
  slug       TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  body       TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Columns added after the initial CREATE TABLE statements (previously
-- applied imperatively in ensureSchema()).
ALTER TABLE personas ADD COLUMN IF NOT EXISTS skill_type TEXT NOT NULL DEFAULT 'persona';

ALTER TABLE leads ADD COLUMN IF NOT EXISTS persona_slug TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS outreach_intent TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'sales';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS skill_slugs TEXT[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_leads_category ON leads (category);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS business_line TEXT NOT NULL DEFAULT 'cmmc';
CREATE INDEX IF NOT EXISTS idx_leads_business_line ON leads (business_line);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS batch_id TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS source_detail TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS fit_score INTEGER;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS fit_reason TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS recommended_service TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS external_source_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS leads_source_external_id_uidx ON leads (source, external_source_id) WHERE external_source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS leads_batch_id_idx ON leads (batch_id);

ALTER TABLE emails ADD COLUMN IF NOT EXISTS resend_message_id TEXT;
ALTER TABLE emails ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
ALTER TABLE emails ADD COLUMN IF NOT EXISTS bounced_at TIMESTAMPTZ;
ALTER TABLE emails ADD COLUMN IF NOT EXISTS bounce_reason TEXT;
ALTER TABLE emails ADD COLUMN IF NOT EXISTS flagged_reason TEXT;
CREATE INDEX IF NOT EXISTS idx_emails_resend_message_id ON emails (resend_message_id);
CREATE INDEX IF NOT EXISTS idx_emails_scheduled_at ON emails (scheduled_at);

ALTER TABLE prompt_runs ADD COLUMN IF NOT EXISTS input_tokens INTEGER;
ALTER TABLE prompt_runs ADD COLUMN IF NOT EXISTS output_tokens INTEGER;
