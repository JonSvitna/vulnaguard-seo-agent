# Implementation Plan: Bulk Import, Persona System, AI Provider Switching

**Spec:** `docs/superpowers/specs/2026-06-16-bulk-import-personas-ai-provider-design.md`
**Date:** 2026-06-16

---

## Assumptions

- `openai` npm package is not yet installed — needs `npm install openai`
- `csv-parse` and `xlsx` npm packages are not yet installed
- The `lib/db.ts` `SCHEMA` const is the authoritative place for new tables; `ALTER TABLE` calls after `pool.query(SCHEMA)` handle additive column changes
- The SEO agent provider logic (env-var detection, `OPENAI_API_KEY` preferred) is the pattern to reuse in the column-inference step
- Persona files live on the filesystem — the API scans the directory at request time, no caching needed

---

## Phase 1 — AI Provider Abstraction

Goal: every marketing agent can be switched between OpenAI and Claude at runtime via a DB-backed config.

### Step 1.1 — Install openai package
```
npm install openai
```
Verify: `node_modules/openai` exists, `package.json` updated.

### Step 1.2 — Add `ai_provider_config` table to `lib/db.ts`

**File:** `lib/db.ts`

Add to the `SCHEMA` const (after `agent_runs` table):
```sql
CREATE TABLE IF NOT EXISTS ai_provider_config (
  agent_name TEXT PRIMARY KEY,
  provider   TEXT NOT NULL DEFAULT 'openai',
  model      TEXT NOT NULL DEFAULT 'gpt-4o',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

Add after `pool.query(SCHEMA)` in the init block:
```sql
INSERT INTO ai_provider_config (agent_name, provider, model)
VALUES ('default', 'openai', 'gpt-4o')
ON CONFLICT DO NOTHING;
```

Verify: app starts, DB connects, no migration errors.

### Step 1.3 — Create `lib/ai-provider.ts`

New file. Reads the config table; falls back to the `'default'` row if no per-agent override exists.

```typescript
import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import { query } from './db'

export type AIProvider = 'openai' | 'claude'

export interface ProviderConfig {
  provider: AIProvider
  model: string
}

export async function getProviderForAgent(agentName: string): Promise<ProviderConfig> {
  const rows = await query<{ provider: string; model: string }>(
    `SELECT provider, model FROM ai_provider_config WHERE agent_name = $1`,
    [agentName]
  )
  if (rows.length) return { provider: rows[0].provider as AIProvider, model: rows[0].model }

  const defaults = await query<{ provider: string; model: string }>(
    `SELECT provider, model FROM ai_provider_config WHERE agent_name = 'default'`
  )
  if (defaults.length) return { provider: defaults[0].provider as AIProvider, model: defaults[0].model }

  // Hard fallback if table is empty
  return { provider: 'openai', model: 'gpt-4o' }
}

export function makeOpenAIClient() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
}

export function makeAnthropicClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
}
```

Verify: TypeScript compiles (`tsc --noEmit`).

### Step 1.4 — Migrate `scout/index.ts` to use provider abstraction

**File:** `vulnaguard-marketing-agents/agents/scout/index.ts`

Replace the hardcoded `new Anthropic(...)` + `anthropic.messages.create(...)` call with a runtime provider check using `getProviderForAgent('scout')`. The function signature and return type stay identical — only the internal AI call changes.

Pattern:
```typescript
const config = await getProviderForAgent('scout')
if (config.provider === 'openai') {
  // use makeOpenAIClient(), model: config.model
} else {
  // use makeAnthropicClient(), model: config.model
}
```

Verify: `tsc --noEmit` passes.

### Step 1.5 — Migrate `outreach/index.ts` to use provider abstraction

**File:** `vulnaguard-marketing-agents/agents/outreach/index.ts`

Same pattern as Step 1.4. Two functions need updating: `qualifyLead()` (agent name: `'qualifier'`) and `draftSequence()` (agent name: `'copywriter'`).

Verify: `tsc --noEmit` passes.

### Step 1.6 — Add AI Provider API routes

**New file:** `app/api/settings/ai-provider/route.ts`

- `GET` — returns all rows from `ai_provider_config` ordered by `agent_name`
- `POST` — accepts `{ agent_name, provider, model }`, upserts the row

### Step 1.7 — Add AI Provider section to Settings page

**File:** `app/(app)/settings/page.tsx` (or wherever settings UI lives — confirm before editing)

Add a section below existing settings:
- Heading: "AI Provider"
- Table with columns: Agent, Provider (toggle: OpenAI / Claude), Model (text input or select)
- Row order: default (global) first, then scout, qualifier, copywriter, content-pipeline
- On change: POST to `/api/settings/ai-provider`, optimistic update
- Provider toggle defaults display: show current DB value, fallback to "openai"

Verify: Settings page renders, toggling an agent updates DB, marketing agents reflect the new provider on next run.

---

## Phase 2 — Persona System

Goal: markdown persona files can be selected at import time (or per lead) and injected into outreach email drafts.

### Step 2.1 — Create personas directory and starter files

```
vulnaguard-marketing-agents/personas/new-startup-intro.md
vulnaguard-marketing-agents/personas/cmmc-specialist.md
```

**`new-startup-intro.md`:**
```markdown
# New Startup Introduction
**Stage:** Early-stage startup, pre-revenue
**Value prop:** Vulnaguard helps defense contractors achieve CMMC compliance faster with automated tracking and audit-ready reporting.
**Tone:** Warm, direct, peer-to-peer — not salesy
**CTA:** 15-minute intro call to learn about their compliance journey

## Extended Instructions
Emphasize that Vulnaguard is new and focused on building relationships, not closing deals.
Lead with genuine curiosity about where they are in their compliance process.
Avoid buzzwords: "cutting-edge", "revolutionary", "game-changing".
Keep subject lines short and human. No cold-call energy.
```

**`cmmc-specialist.md`:**
```markdown
# CMMC Compliance Specialist
**Stage:** Established, domain expert positioning
**Value prop:** Vulnaguard automates CMMC Level 2/3 evidence collection, reducing audit prep time by 60%.
**Tone:** Authoritative, technical, peer-to-peer with compliance professionals
**CTA:** Demo of the evidence collection dashboard

## Extended Instructions
Speak the language of CMMC practitioners: SSP, POA&M, assessment objectives, NIST 800-171.
Reference specific pain points: manual evidence collection, auditor requests, recurring assessments.
Assume the reader knows what CMMC is — don't over-explain.
```

### Step 2.2 — Add `persona_slug` column to leads

**File:** `lib/db.ts`

Add after existing `ALTER TABLE` calls:
```sql
ALTER TABLE leads ADD COLUMN IF NOT EXISTS persona_slug TEXT;
```

### Step 2.3 — Create `GET /api/marketing/personas` route

**New file:** `app/api/marketing/personas/route.ts`

Scans `vulnaguard-marketing-agents/personas/` using `fs.readdirSync`. For each `.md` file:
- `slug` = filename without `.md`
- `name` = first `# Heading` line, stripped of `# `
- `preview` = first 120 chars of non-heading, non-empty body text

Returns `{ personas: { slug, name, preview }[] }`.

### Step 2.4 — Inject persona into `draftSequence()`

**File:** `vulnaguard-marketing-agents/agents/outreach/index.ts`

Update `draftSequence(lead)` signature to accept `personaSlug?: string | null`.

If `personaSlug` is provided:
1. Read `vulnaguard-marketing-agents/personas/${personaSlug}.md` using `fs.readFileSync`
2. Prepend to the copywriter system prompt:
   ```
   ## Sender Persona\n\n${personaContent}\n\n---\n\n
   ```
3. If file doesn't exist, log a warning and proceed without injection

If no `personaSlug`: use `COPYWRITER_PROMPT` unchanged.

Update all callers of `draftSequence()` to pass `lead.persona_slug`.

Verify: `tsc --noEmit` passes.

### Step 2.5 — Persona selector in lead detail view

**File:** `app/(app)/dashboard/marketing-agents/page.tsx`

In the lead detail panel, add a "Persona" row:
- Shows current `persona_slug` (or "None")
- Dropdown populated from `GET /api/marketing/personas`
- On change: `PATCH /api/marketing/leads/[id]` with `{ persona_slug }` (extend the existing lead update route)

Verify: selecting a persona on a lead, then running "Draft Sequence" uses the persona content in the generated emails.

---

## Phase 3 — CSV/Excel Bulk Import

Goal: upload a CSV or Excel file, AI infers column mapping, user confirms, leads are imported with optional persona.

### Step 3.1 — Install parsing packages

```
npm install csv-parse xlsx
npm install --save-dev @types/xlsx
```

### Step 3.2 — Create `POST /api/marketing/leads/import-file`

**New file:** `app/api/marketing/leads/import-file/route.ts`

Accepts multipart form with a single file field (`file`).

1. Detect format by extension (`.csv` → csv-parse, `.xlsx`/`.xls` → xlsx)
2. Parse headers + first 3 data rows
3. Build prompt: send headers + sample rows to active AI provider (same env-var detection as SEO agent: `OPENAI_API_KEY` → `gpt-4.1`, else `ANTHROPIC_API_KEY` → `claude-sonnet-4-6`)
4. AI returns a JSON mapping `{ company_name: "column_header" | null, ... }` for all 10 lead fields
5. Also parse and buffer **all rows** (not just 3) — return them as a serialized array so the confirm step doesn't need re-upload
6. Return `{ suggested_mapping, sample_rows: first3, all_rows: allParsed, total_rows: N }`

Column inference prompt (concise, deterministic):
```
Given these CSV headers: [headers]
And sample rows: [rows as JSON]

Map each target field to the best matching header, or null if no match.
Target fields: company_name, website, location, org_type, cmmc_level_sought,
employee_count, contact_name, contact_title, contact_email, contact_linkedin

Respond with only valid JSON: { "company_name": "...", "website": "...", ... }
```

### Step 3.3 — Create `POST /api/marketing/leads/import-confirm`

**New file:** `app/api/marketing/leads/import-confirm/route.ts`

Accepts `{ mapping, all_rows, persona_slug }`.

1. For each row in `all_rows`, apply `mapping` to extract lead fields
2. Skip rows where `company_name` is blank after mapping
3. Deduplicate by `LOWER(company_name)` against existing leads (same as current import)
4. Insert with `source = 'csv_import'`, `persona_slug` (may be null)
5. Run qualification via `qualifyAndUpdateLead()` (same as current import)
6. Return `{ extracted, imported, skipped_duplicates, qualified, disqualified, leads }`

### Step 3.4 — Add import UI to marketing-agents page

**File:** `app/(app)/dashboard/marketing-agents/page.tsx`

**Two new states to add:**

**State A — File picker:**
- "Import CSV/Excel" button near the existing import controls
- `<input type="file" accept=".csv,.xlsx,.xls">` (hidden, triggered by button)
- On file select: POST to `/api/marketing/leads/import-file`, show loading state

**State B — Mapping Review screen** (shown after import-file returns):
- Heading: "Review Column Mapping (N rows)"
- Table: one row per lead field, two columns — "Field" and a `<select>` showing all CSV headers + "— skip —" option, pre-selected to suggested mapping
- Persona selector: dropdown from `GET /api/marketing/personas` + "None" option (optional)
- "Confirm Import" button → POST to `/api/marketing/leads/import-confirm`
- "Cancel" button → return to normal view
- On confirm success: show import summary toast, refresh leads list

Verify: upload a test CSV, mapping screen appears with correct suggestions, confirm imports leads, leads appear in the pipeline with correct `source = 'csv_import'`.

---

## Success Criteria

| Feature | Check |
|---------|-------|
| AI provider toggle | Flipping `scout` to Claude in Settings → next scout run uses `claude-sonnet-4-6` |
| Global default | Changing default to OpenAI → all agents without overrides use `gpt-4o` |
| Persona injection | Lead with `new-startup-intro` persona → drafted emails reference startup tone |
| Persona optional | Import with "None" persona → leads import successfully, `persona_slug = null` |
| CSV import | Upload 900-row CSV → mapping screen shows, confirm inserts correct leads |
| Deduplication | Re-upload same CSV → `skipped_duplicates = N`, no new leads inserted |
| Excel import | `.xlsx` file → same flow works |
| `tsc --noEmit` | No TypeScript errors after all phases |

---

## Files Created / Modified

### New files
- `lib/ai-provider.ts`
- `app/api/settings/ai-provider/route.ts`
- `app/api/marketing/personas/route.ts`
- `app/api/marketing/leads/import-file/route.ts`
- `app/api/marketing/leads/import-confirm/route.ts`
- `vulnaguard-marketing-agents/personas/new-startup-intro.md`
- `vulnaguard-marketing-agents/personas/cmmc-specialist.md`

### Modified files
- `lib/db.ts` — new table + seed row + ALTER TABLE for `persona_slug`
- `vulnaguard-marketing-agents/agents/scout/index.ts` — provider abstraction
- `vulnaguard-marketing-agents/agents/outreach/index.ts` — provider abstraction + persona injection
- `app/(app)/dashboard/marketing-agents/page.tsx` — persona selector + CSV import UI
- `app/(app)/settings/page.tsx` — AI provider section
