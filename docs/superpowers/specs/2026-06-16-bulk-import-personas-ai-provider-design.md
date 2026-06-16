# Bulk Import, Persona System, and AI Provider Switching

**Date:** 2026-06-16
**Status:** Approved

---

## Overview

Three related features for the marketing pipeline:

1. **CSV/Excel bulk import** — upload a structured contact file, AI infers column mapping, user confirms before import
2. **Persona system** — markdown files that define who Vulnaguard is and why it's reaching out; selected per import batch and injected into outreach prompts
3. **AI provider switching** — OpenAI as global default, per-agent overrides, managed via Settings UI

---

## Feature 1: CSV/Excel Bulk Import

### Flow

1. User clicks "Import CSV/Excel" on the marketing-agents page
2. File picker opens — accepts `.csv`, `.xlsx`, `.xls`
3. File uploads via multipart form to `POST /api/marketing/leads/import-file`
4. Server parses headers + first 3 data rows using `csv-parse` (CSV) and `xlsx` (Excel)
5. Server sends headers + sample rows to the active AI provider to infer column→field mapping — uses the same provider-detection logic as the SEO agent: OpenAI `gpt-4.1` if `OPENAI_API_KEY` is set, else Claude `claude-sonnet-4-6`
6. Returns `{ suggested_mapping, sample_rows }` to the client
7. Client renders a **Mapping Review screen**:
   - Each lead field has a dropdown pre-filled with the suggested column — user can override
   - Persona selector dropdown (optional — can be assigned later per lead)
   - "Import N rows" confirm button
8. Confirmed mapping + persona slug POST to `POST /api/marketing/leads/import-confirm`
9. Server applies mapping row-by-row, deduplicates by `company_name`, inserts with `source = 'csv_import'`
10. Runs qualification pipeline (same as existing text-import flow)
11. Returns import summary: extracted, imported, skipped duplicates, qualified, disqualified

### Lead Fields for Mapping

| Field | DB Column |
|-------|-----------|
| Company Name | `company_name` (required) |
| Website | `website` |
| Location | `location` |
| Org Type | `org_type` |
| CMMC Level | `cmmc_level_sought` |
| Employee Count | `employee_count` |
| Contact Name | `contact_name` |
| Contact Title | `contact_title` |
| Contact Email | `contact_email` |
| Contact LinkedIn | `contact_linkedin` |

### New API Routes

- `POST /api/marketing/leads/import-file` — multipart upload, returns suggested mapping + sample rows
- `POST /api/marketing/leads/import-confirm` — accepts confirmed mapping, parsed rows, persona slug; runs full import

### New Dependencies

- `csv-parse` — CSV parsing
- `xlsx` — Excel parsing

### Existing import stays unchanged

The current text-paste flow (`POST /api/marketing/scout/import`) is unaffected.

---

## Feature 2: Persona System

### Persona Files

Directory: `vulnaguard-marketing-agents/personas/`

Each persona is a markdown file. The filename slug is the identifier (e.g., `new-startup-intro.md` → slug `new-startup-intro`).

**Example file structure:**

```markdown
# New Startup Introduction
**Stage:** Early-stage startup, pre-revenue
**Value prop:** We help defense contractors achieve CMMC compliance faster...
**Tone:** Warm, direct, not salesy — peer-to-peer
**CTA:** 15-minute intro call, no pitch

## Extended Instructions
When writing outreach for this persona, emphasize that we are new and building
relationships, not closing deals. Lead with curiosity about their compliance
journey. Avoid buzzwords like "cutting-edge" or "revolutionary."
```

### API

- `GET /api/marketing/personas` — scans `vulnaguard-marketing-agents/personas/`, returns `{ slug, name, preview }[]`
  - `name` parsed from the first `#` heading
  - `preview` is the first 120 characters of body text

### DB Change

Add `persona_slug TEXT` column to `leads` table. Stored at import time, persists with the lead.

### Outreach Agent Change

`draftSequence()` in `vulnaguard-marketing-agents/agents/outreach/index.ts`:
- Reads the persona `.md` file for the lead's `persona_slug`
- Prepends the full persona content to the `COPYWRITER_PROMPT` system prompt
- Leads without a persona use the current system prompt unchanged

### UI

- Persona selector shown on the Mapping Review screen during import (optional)
- Individual lead detail view allows assigning or re-assigning persona at any time

### Starter Personas

Two starter files ship with the feature:
- `vulnaguard-marketing-agents/personas/new-startup-intro.md`
- `vulnaguard-marketing-agents/personas/cmmc-specialist.md`

---

## Feature 3: AI Provider Switching

### Provider Abstraction

New file: `lib/ai-provider.ts`

Exports:
```typescript
type Provider = 'openai' | 'claude'
interface ProviderConfig { provider: Provider; model: string }

export async function getProviderForAgent(agentName: string): Promise<ProviderConfig>
```

Reads from the DB, falls back to the `'default'` row. All marketing agents call this instead of hardcoding Anthropic.

### DB Schema

New table `ai_provider_config`:

```sql
CREATE TABLE IF NOT EXISTS ai_provider_config (
  agent_name TEXT PRIMARY KEY,
  provider   TEXT NOT NULL DEFAULT 'openai',
  model      TEXT NOT NULL DEFAULT 'gpt-4o',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Seed row** (inserted on schema init):
```sql
INSERT INTO ai_provider_config (agent_name, provider, model)
VALUES ('default', 'openai', 'gpt-4o')
ON CONFLICT DO NOTHING;
```

**Agent names:**
- `default` — global fallback
- `scout` — lead extractor
- `qualifier` — lead scorer
- `copywriter` — email sequence drafter
- `content-pipeline` — social content generator

### API Routes

- `GET /api/settings/ai-provider` — returns all rows
- `POST /api/settings/ai-provider` — upserts a row `{ agent_name, provider, model }`

### Settings UI

New "AI Provider" section on the Settings page:

- Global default row at top — provider toggle + model selector
- Per-agent rows below — same controls, blank = inherits global
- Changing global default immediately affects all un-pinned agents

### Dependencies

- `openai` npm package (already has `OPENAI_API_KEY` in env)

### Agent Migration

All three current agents (`scout/index.ts`, `outreach/index.ts`) replace their hardcoded `new Anthropic(...)` calls with a `getProviderForAgent(agentName)` call that returns the right client and model at runtime.

---

## Execution Order

1. AI provider abstraction (`lib/ai-provider.ts` + DB table + Settings UI) — unblocks everything else
2. Persona system (directory + API + DB column + outreach agent injection + starter files)
3. CSV/Excel import (new API routes + Mapping Review UI + import-file + import-confirm)

---

## Out of Scope

- Sending emails (existing send queue handles this)
- Per-contact persona overrides (persona is set at import batch level)
- Fine-grained model parameter tuning (temperature, max_tokens) in the UI
