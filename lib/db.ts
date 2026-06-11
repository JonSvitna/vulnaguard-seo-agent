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
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_content_pipeline_brand ON content_pipeline_records (brand);
CREATE INDEX IF NOT EXISTS idx_content_pipeline_created_at ON content_pipeline_records (created_at DESC);
`

export async function ensureSchema(): Promise<void> {
  if (!global.__pgInit) {
    global.__pgInit = (async () => {
      const pool = getPool()
      await pool.query(SCHEMA)
      await pool.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS phase TEXT DEFAULT 'research'`)
      await pool.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS phase_status TEXT DEFAULT 'pending'`)
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
