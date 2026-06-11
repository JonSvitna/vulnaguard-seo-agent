# Marketing Agents — Foundation (Sub-spec 1 of 4)

## Problem

The Marketing Agents dashboard at `/dashboard/marketing-agents` is fully mocked: it points at `http://localhost:8000` (a Python FastAPI service that doesn't run in production), gates all calls behind a `useMock` flag, and renders hardcoded `MOCK_STATS`/`MOCK_PENDING`/`MOCK_LEADS`. The Python backend itself (`/vulnaguard-marketing-agents/`) is non-functional — it mixes SQLite-style calls (`conn.execute("...?")`, `.fetchone()`, `cursor.lastrowid`) against a `psycopg2` Postgres connection (41 mismatched call sites across `agents/` and `pipeline/orchestrator.py`), and only `agent_config` exists as a table — `leads`, `sequences`, `emails`, `linkedin_messages`, and `pipeline_runs` are referenced but never created.

This is sub-spec 1 of 4 in the "port Marketing Agents to TypeScript inside the existing Next.js app" effort (decided over fixing the Python backend in place, to keep a single deploy, single DB pool, no CORS, and reuse of existing Anthropic/OpenAI keys). The end goal is **automation with the ability to go manual** — Scout/Qualifier/Copywriter/Sender agents will be ported in sub-specs 2–4 (each gated on a new credential: existing LLM keys, then `APIFY_API_KEY`, then SMTP creds).

This Foundation spec needs no new credentials. It establishes the schema, CRUD/workflow API routes, and dashboard wiring so the system is fully usable via manual data entry while the automation sub-specs are built.

## Schema

New tables added to `lib/db.ts`'s `ensureSchema()`, alongside the existing `sessions`/`messages`/`results`/`inventory` tables:

```sql
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

CREATE TABLE IF NOT EXISTS sequences (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'drafted', -- drafted, approved, rejected, sent
  created_at TIMESTAMPTZ DEFAULT NOW(),
  approved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS emails (
  id SERIAL PRIMARY KEY,
  sequence_id INTEGER NOT NULL REFERENCES sequences(id) ON DELETE CASCADE,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  touch_number INTEGER NOT NULL,
  subject TEXT,
  body TEXT,
  channel TEXT NOT NULL DEFAULT 'email',
  status TEXT NOT NULL DEFAULT 'drafted', -- drafted, sent
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS linkedin_messages (
  id SERIAL PRIMARY KEY,
  sequence_id INTEGER NOT NULL REFERENCES sequences(id) ON DELETE CASCADE,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'drafted'
);

CREATE TABLE IF NOT EXISTS pipeline_runs (
  id SERIAL PRIMARY KEY,
  agent TEXT NOT NULL,
  status TEXT NOT NULL,
  leads_processed INTEGER NOT NULL DEFAULT 0,
  details JSONB,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS agent_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

`agent_config` is seeded (insert `ON CONFLICT DO NOTHING`) with the same defaults the Python `init_db()` used, plus two new keys for the Settings tab:

| key | default |
|---|---|
| `llm_provider` | `claude` |
| `llm_tier` | `balanced` |
| `qualifier_min_score` | `6` |
| `sequence_delay_days` | `4,9` |
| `daily_send_limit` | `50` |
| `batch_size` | `10` |
| `smtp_host` | `` (empty) |
| `smtp_from` | `` (empty) |

`pipeline_runs` is created now but stays empty until an automation sub-spec writes to it; the Pipeline tab's "Recent Runs" list reads from it and shows "No runs yet" when empty.

## Cleanup

Delete `/vulnaguard-marketing-agents/` (the Python backend) entirely — it's broken, non-functional, and fully superseded by this TypeScript port across the 4 sub-specs.

## API Routes

All under `app/api/marketing/`, following the existing `pg`-pool + `query()` pattern from `lib/db.ts`. All routes set `runtime = 'nodejs'` and `dynamic = 'force-dynamic'`.

| Route | Method | Purpose |
|---|---|---|
| `/api/marketing/stats` | GET | Counts of leads grouped by status (`discovered`/`qualified`/`disqualified`/`drafted`/`approved`/`sent`/`replied`) plus `total`, and the last 10 rows from `pipeline_runs` |
| `/api/marketing/leads` | GET | List leads, optional `?status=` filter, ordered by `updated_at DESC` |
| `/api/marketing/leads` | POST | Create a manual lead. `source` defaults to `'manual'`; caller may set initial `status` and `score` to support full-lifecycle manual testing |
| `/api/marketing/leads/[id]` | GET | Lead detail including its sequence (emails + LinkedIn message), if any |
| `/api/marketing/leads/[id]` | PATCH | Update any lead field (status, score, contact info, etc.) |
| `/api/marketing/leads/[id]` | DELETE | Delete lead (cascades to its sequence/emails/linkedin message) |
| `/api/marketing/leads/[id]/sequence` | PUT | Create or replace the lead's sequence: 3 emails (subject + body) + LinkedIn message. Sets sequence status to `drafted`; advances lead status to `drafted` if it isn't already further along |
| `/api/marketing/approval/pending` | GET | All sequences with status `drafted`, joined with lead info, emails, and LinkedIn message — feeds the Approval Queue tab |
| `/api/marketing/approval/approve` | POST | `{ sequence_ids: number[] }` → sequences become `approved`, their leads become `approved` |
| `/api/marketing/approval/reject` | POST | `{ sequence_ids: number[] }` → sequences become `rejected`, their leads become `rejected` |
| `/api/marketing/sequences/[id]/mark-sent` | POST | Manual stand-in for the future Sender agent: sequence, its emails, and the lead all move to `sent` |
| `/api/marketing/config` | GET | Return all `agent_config` key/value pairs |
| `/api/marketing/config` | POST | Upsert one or more `agent_config` keys (`INSERT ... ON CONFLICT (key) DO UPDATE`) |

## Dashboard Wiring (`app/dashboard/marketing-agents/page.tsx`)

**Remove**: the `API` constant (`http://localhost:8000`), the `useMock` toggle, all `MOCK_STATS`/`MOCK_PENDING`/`MOCK_LEADS` constants, and `apiCall`'s mock short-circuit. All calls become same-origin fetches to `/api/marketing/...`.

**Data loading**: on mount, fetch `/api/marketing/stats`, `/api/marketing/leads`, `/api/marketing/approval/pending`, and `/api/marketing/config` to populate `stats`, `leads`, `pending`, and provider/model/settings state. Re-fetch stats + leads + pending after any mutation (add/edit/delete lead, save sequence, approve, reject, mark sent).

**Leads tab**:
- New "+ Add Lead" button opens a modal form covering all lead fields (company name required; website, location, org_type, cmmc_level_sought, employee_count, contact name/title/email/linkedin, plus a status dropdown and score input for setting initial lifecycle state). Submits via `POST /api/marketing/leads`.
- Each row gains an "Actions" column: **Edit** (modal to update any field including status/score), **Sequence** (opens the sequence editor), **Delete**, and **Mark Sent** (shown only when the lead's status is `approved`).

**Sequence editor modal** (opened from the Leads tab): a form with Email 1/2/3 (subject + body textareas) and a LinkedIn message textarea. Saving calls `PUT /api/marketing/leads/[id]/sequence`, which sets the lead to `drafted` and surfaces it in the Approval Queue.

**Approval Queue tab**: `pending` is sourced from `/api/marketing/approval/pending`. The existing Approve/Reject/Approve-selected buttons call the real approve/reject endpoints.

**Pipeline tab**: "Full Pipeline" and "Send Approved" buttons become disabled with a "Coming soon" badge and tooltip ("Automation ships in a future update — use manual lead entry for now"). "Recent Runs" reads `stats.recent_runs`; an empty list shows "No runs yet".

**Header provider toggle**: `toggleProvider` calls `POST /api/marketing/config` with `{ llm_provider, llm_tier }` (replacing the old `/api/config/provider` call).

**Settings tab**: all fields (`qualifier_min_score`, `daily_send_limit`, `batch_size`, `smtp_host`, `smtp_from`) become controlled inputs initialized from `GET /api/marketing/config`. "Save Settings" issues one `POST /api/marketing/config` with the changed keys.

## Testing Plan

- `npx tsc --noEmit` and `npm run build` for type/build correctness
- Manual end-to-end walkthrough in dev: add a lead → edit its status/score → write a sequence → verify it appears in the Approval Queue → approve → mark sent → verify the stats bar counts update at each step
- Verify `/api/marketing/config` round-trips: save settings, reload the page, confirm values persist
- Verify Pipeline tab buttons render disabled with "Coming soon" and don't error on click

## Out of Scope (covered by later sub-specs)

- Scout: Apify scraping + LLM-based entity extraction (replacing spaCy) — sub-spec 3, requires `APIFY_API_KEY`
- Qualifier + Copywriter: LLM-based auto-scoring and auto-drafted sequences — sub-spec 2, uses existing Anthropic/OpenAI keys
- Sender: SMTP dispatch automation, daily limits, reply tracking — sub-spec 4, requires SMTP credentials
- `pipeline_runs` populated by real agent runs (table exists now but stays empty until an automation sub-spec writes to it)
