# Unified Job Log — Design

## Context

This is sub-project #2 of the AI-OS direction (see `2026-06-12-agent-registry-design.md` for sub-project #1, the Agent Registry). With the generic `POST /api/agents/[name]/run` dispatch route in place, this sub-project adds a generic log of every invocation through that route — a "process list" for the registry.

## Scope

**In scope (v1):**
- `agent_runs` table in `lib/db.ts`
- `app/api/agents/[name]/run/route.ts` writes a row to `agent_runs` for every actual agent invocation (success or error)

**Out of scope (future sub-projects):**
- Retrofitting existing bespoke routes (`run-ai`, `scout/import`, `content-pipeline/*`) to log here — they keep their current logging (e.g. `pipeline_runs`) untouched
- Any UI/dashboard view of `agent_runs` — deferred to sub-project #4 (Unified Dashboard), once #3 (Orchestration) gives the registry route real traffic
- Logging 404 (unknown agent) or 400 (invalid JSON) responses — these aren't agent runs, just request validation failures

## Architecture

### `agent_runs` table

Added to `SCHEMA` in `lib/db.ts`, following the existing `pipeline_runs` pattern:

```sql
CREATE TABLE IF NOT EXISTS agent_runs (
  id SERIAL PRIMARY KEY,
  agent_name TEXT NOT NULL,
  status TEXT NOT NULL,        -- 'success' | 'error'
  input JSONB,
  output JSONB,
  error TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_agent_runs_started_at ON agent_runs (started_at DESC);
```

### Route changes (`app/api/agents/[name]/run/route.ts`)

The existing 404 (unknown agent name) and 400 (invalid JSON body) checks remain unchanged and are not logged. Around the `agent.run(body)` call:

1. Capture `started_at = new Date()`.
2. Call `agent.run(body)`.
3. **On success**: insert into `agent_runs` with `agent_name = name`, `status = 'success'`, `input = body`, `output = result`, `started_at`, `finished_at = new Date()`. Return `{ result }` as before.
4. **On error** (the existing catch block): insert into `agent_runs` with `agent_name = name`, `status = 'error'`, `input = body`, `error = message`, `started_at`, `finished_at = new Date()`. Return the existing `500 { error }` response as before.

### Logging failures don't affect the response

The `agent_runs` insert is wrapped in its own try/catch. If the insert itself fails (DB error), it is `console.error`'d and swallowed — the response to the caller (success result or error message) is unaffected. The job log is observability, not a dependency of the agent call.

## Testing Plan

1. `npm run build` passes (new table in schema, no type errors in the route).
2. `POST /api/agents/scout/run` with a valid `{"rawText": "..."}` → response unchanged (`{ result: ExtractedLead[] }`); `SELECT * FROM agent_runs ORDER BY id DESC LIMIT 1` shows `status='success'`, `agent_name='scout'`, populated `output`.
3. `POST /api/agents/scout/run` with `{}` (missing `rawText`) → response unchanged (`500 { error: "Raw text is required" }`); latest `agent_runs` row shows `status='error'`, `error='Raw text is required'`.
4. `POST /api/agents/nonexistent/run` → `404` as before; confirm **no** new row was inserted into `agent_runs`.
