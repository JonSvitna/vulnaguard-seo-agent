import { Pool } from 'pg'

declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined
  // eslint-disable-next-line no-var
  var __pgInit: Promise<void> | undefined
}

function buildPool(): Pool {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set. Attach a Postgres plugin in Railway.')
  }
  const ssl =
    process.env.PGSSLMODE === 'disable' ||
    /\blocalhost\b|127\.0\.0\.1|\.railway\.internal\b/.test(connectionString)
      ? false
      : { rejectUnauthorized: false }
  return new Pool({ connectionString, ssl, max: 5 })
}

export function getPool(): Pool {
  if (!global.__pgPool) global.__pgPool = buildPool()
  return global.__pgPool
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
  id           UUID PRIMARY KEY,
  site_id      TEXT NOT NULL,
  provider     TEXT,
  title        TEXT,
  phase        TEXT DEFAULT 'research',
  phase_status TEXT DEFAULT 'pending',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sessions_site_updated_idx ON sessions (site_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  id           BIGSERIAL PRIMARY KEY,
  session_id   UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role         TEXT NOT NULL,
  content      TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS messages_session_idx ON messages (session_id, id);

CREATE TABLE IF NOT EXISTS results (
  id           BIGSERIAL PRIMARY KEY,
  session_id   UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  site_id      TEXT NOT NULL,
  kind         TEXT NOT NULL,
  path         TEXT,
  content      TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS results_session_idx ON results (session_id, id);
CREATE INDEX IF NOT EXISTS results_site_idx ON results (site_id, created_at DESC);

CREATE TABLE IF NOT EXISTS inventory (
  site_id      TEXT PRIMARY KEY,
  blogs        INTEGER NOT NULL DEFAULT 0,
  services     INTEGER NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS content_pipeline_records (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand           VARCHAR(50)   NOT NULL DEFAULT 'vulnaguard',
  capture_mode    VARCHAR(10)   NOT NULL CHECK (capture_mode IN ('type', 'voice', 'video')),
  raw_input       TEXT          NOT NULL,
  core_idea       TEXT          NOT NULL,
  linkedin        TEXT          NOT NULL,
  instagram       TEXT          NOT NULL,
  facebook        TEXT          NOT NULL,
  youtube_desc    TEXT          NOT NULL,
  youtube_short   TEXT          NOT NULL,
  video_brief     JSONB         NOT NULL DEFAULT '{}',
  video_script    TEXT,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_content_pipeline_brand ON content_pipeline_records (brand);
CREATE INDEX IF NOT EXISTS idx_content_pipeline_created_at ON content_pipeline_records (created_at DESC);

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
`

const AGENT_CONFIG_DEFAULTS: Record<string, string> = {
  llm_provider: 'claude',
  llm_tier: 'balanced',
  qualifier_min_score: '6',
  sequence_delay_days: '4,9',
  daily_send_limit: '50',
  batch_size: '10',
  smtp_host: '',
  smtp_from: '',
}

export async function ensureSchema(): Promise<void> {
  if (!global.__pgInit) {
    global.__pgInit = (async () => {
      const pool = getPool()
      await pool.query(SCHEMA)
      await pool.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS phase TEXT DEFAULT 'research'`)
      await pool.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS phase_status TEXT DEFAULT 'pending'`)
      await pool.query(`ALTER TABLE content_pipeline_records ADD COLUMN IF NOT EXISTS video_script TEXT`)
      for (const [key, value] of Object.entries(AGENT_CONFIG_DEFAULTS)) {
        await pool.query(
          `INSERT INTO agent_config (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING`,
          [key, value]
        )
      }
    })().catch((err) => {
      global.__pgInit = undefined
      throw err
    })
  }
  return global.__pgInit
}

export async function query<T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<T[]> {
  await ensureSchema()
  const res = await getPool().query(text, params as never)
  return res.rows as T[]
}
