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
`

const AGENT_CONFIG_DEFAULTS: Record<string, string> = {
  llm_provider: 'claude',
  llm_tier: 'balanced',
  qualifier_min_score: '6',
  sequence_delay_days: '4,9',
  daily_send_limit: '100',
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
      await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS persona_slug TEXT`)
      await pool.query(`ALTER TABLE personas ADD COLUMN IF NOT EXISTS skill_type TEXT NOT NULL DEFAULT 'persona'`)
      await pool.query(`ALTER TABLE content_pipeline_records ADD COLUMN IF NOT EXISTS hyperframes_prompt TEXT`)
      await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS outreach_intent TEXT`)
      await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'sales'`)
      await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS skill_slugs TEXT[] NOT NULL DEFAULT '{}'`)
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_leads_category ON leads (category)`)
      await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS business_line TEXT NOT NULL DEFAULT 'cmmc'`)
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_leads_business_line ON leads (business_line)`)
      await pool.query(`ALTER TABLE emails ADD COLUMN IF NOT EXISTS resend_message_id TEXT`)
      await pool.query(`ALTER TABLE emails ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ`)
      await pool.query(`ALTER TABLE emails ADD COLUMN IF NOT EXISTS bounced_at TIMESTAMPTZ`)
      await pool.query(`ALTER TABLE emails ADD COLUMN IF NOT EXISTS bounce_reason TEXT`)
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_emails_resend_message_id ON emails (resend_message_id)`)
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_emails_scheduled_at ON emails (scheduled_at)`)
      await pool.query(
        `INSERT INTO ai_provider_config (agent_name, provider, model) VALUES ('default', 'openai', 'gpt-4o') ON CONFLICT DO NOTHING`
      )
      await pool.query(
        `INSERT INTO ai_provider_config (agent_name, provider, model) VALUES ('content-pipeline', 'openai', 'gpt-4.1') ON CONFLICT DO NOTHING`
      )
      // SEO modules — each independently configurable in Settings, defaulting to Haiku for cost.
      for (const m of ['seo-m1', 'seo-m2', 'seo-m3', 'seo-m4', 'seo-m5', 'seo-m6']) {
        await pool.query(
          `INSERT INTO ai_provider_config (agent_name, provider, model) VALUES ($1, 'claude', 'claude-haiku-4-5-20251001') ON CONFLICT DO NOTHING`,
          [m]
        )
      }
      // Seed built-in personas (idempotent)
      await pool.query(`
        INSERT INTO personas (slug, name, body) VALUES
        ('new-startup-intro', 'New Startup Introduction', $1),
        ('cmmc-specialist', 'CMMC Compliance Specialist', $2)
        ON CONFLICT (slug) DO NOTHING
      `, [
        `# New Startup Introduction\n**Stage:** Early-stage startup, pre-revenue\n**Value prop:** Vulnaguard helps defense contractors achieve CMMC compliance faster with automated tracking and audit-ready reporting.\n**Tone:** Warm, direct, peer-to-peer — not salesy\n**CTA:** 15-minute intro call to learn about their compliance journey\n\n## Extended Instructions\nEmphasize that Vulnaguard is new and focused on building relationships, not closing deals.\nLead with genuine curiosity about where they are in their compliance process.\nAvoid buzzwords: "cutting-edge", "revolutionary", "game-changing".\nKeep subject lines short and human. No cold-call energy.\nFrame the outreach as one founder reaching out to a peer, not a vendor pitching a prospect.`,
        `# CMMC Compliance Specialist\n**Stage:** Established, domain expert positioning\n**Value prop:** Vulnaguard automates CMMC Level 2/3 evidence collection, reducing audit prep time by 60%.\n**Tone:** Authoritative, technical, peer-to-peer with compliance professionals\n**CTA:** Demo of the evidence collection dashboard\n\n## Extended Instructions\nSpeak the language of CMMC practitioners: SSP, POA&M, assessment objectives, NIST 800-171.\nReference specific pain points: manual evidence collection, auditor requests, recurring assessments.\nAssume the reader knows what CMMC is — don't over-explain the program.\nLead with the operational cost of compliance prep, not the risk of non-compliance.\nPosition Vulnaguard Sentinel as the tool a seasoned compliance team would choose, not a beginner's guide.`,
      ])
      // Seed Sean's Voice as a voice skill
      await pool.query(`
        INSERT INTO personas (slug, name, body, skill_type) VALUES ($1, $2, $3, 'voice')
        ON CONFLICT (slug) DO NOTHING
      `, [
        'seans-voice-vulnaguard',
        "Sean's Voice — Vulnaguard",
        `# Sean's Voice — Vulnaguard

**Role:** You are Sean's personal content engine for Vulnaguard — a web application security and compliance intelligence company with a product called Sentinel.

**Voice:** Write in first person as Sean. You are a founder, practitioner, and someone who has personally been through the compliance grind. Not a brand account. A real person who has sat on both sides of the audit table. You speak like a coworker helping another coworker — calm, direct, human, zero pressure.

**Philosophy:** "It's not you. It's the setup." People don't fail compliance because they don't care. They fail because the process is confusing, the tools are overcomplicated, and nobody explained it in plain English. Every post should leave the reader feeling heard and understood — not sold to.

**Shared Experience:** Use first-person lived experience often.
Examples:
- "I've sat on that side of the table."
- "I've been through audits where more time was spent chasing paperwork than improving security."
- "I've watched good teams lose momentum simply because nobody explained the process clearly."
- "At one point we had so many spreadsheets open that Excel probably thought we were trying to break it."

**Humor:** Optional, never forced. Something a coworker says grabbing coffee — to reduce tension, not get a laugh.
Examples:
- "Compliance has a unique talent for turning a five-minute task into a three-hour scavenger hunt."
- "Sometimes it feels like you're waiting on an auditor the same way you're waiting on that package that says 'out for delivery' for three days."

**Tone Rules:**
- Conversational, calm, direct, authoritative but accessible
- Security expert speaking to business owners, not engineers
- NEVER use: "unlock your potential", "game-changing", "revolutionize", "leverage cutting-edge", "synergy", "hope this finds you well", "I wanted to reach out", corporate buzzwords of any kind

**Phrases to use:** "I get it." / "That makes sense." / "That's not on you." / "Here's what I'd focus on first." / "No pressure." / "The simpler way to look at it is..." / "We've been through that ourselves."

**Themes:** Compliance made simple, proactive protection, SMB-focused, real consequences of inaction, Vulnaguard Sentinel as the tool that removes friction.`,
      ])

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
