# Skills / Voice Profiles + Leads Pagination — Design Spec

**Date:** 2026-06-17
**Branch:** claude/lead-scoring-categories-eu3vop
**Status:** Approved

---

## Overview

Two related improvements to the marketing leads dashboard:

1. **Skills / Voice Profiles** — a dedicated Skills tab where multiple voice-style profiles can be authored, saved, and stacked per draft. Replaces the current single-persona-or-voice-skill dropdown with a multi-select checklist, so the AI receives layered style instructions instead of one generic prompt.

2. **Leads Pagination** — 25-rows-per-page pagination for the leads table, respecting existing status and category filter tabs.

Also bundled: table column-width fix so badges and action buttons don't get squeezed.

---

## Problem

- Outreach copy sounds generic / AI-generated. Subject lines are obvious AI slop.
- Only one persona or voice skill can be selected per draft. Cannot stack "Sean's Voice" + "Subject line rules" simultaneously.
- No dedicated Skills section — voice skills are buried in the Personas tab alongside sender identities.
- Leads table is one long unbroken list; unusable at scale.
- "Relationship Building" badge and action buttons get cut off due to unconstrained column widths.

---

## Data Model

### `leads` table
Add one column via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`:

```sql
ALTER TABLE leads ADD COLUMN IF NOT EXISTS skill_slugs TEXT[] NOT NULL DEFAULT '{}';
```

Stores the array of voice skill slugs chosen for this lead's last draft. Reset to `'{}'` when category changes (same reset logic as score/status in the PATCH handler).

### `personas` table
No schema change. `skill_type = 'voice'` already discriminates voice skills from outreach personas. The seeded "Sean's Voice — Vulnaguard" row is the first voice skill.

---

## Backend Changes

### `vulnaguard-marketing-agents/agents/outreach/index.ts`

`draftSequence` gains a `skillSlugs?: string[] | null` parameter:

```typescript
export async function draftSequence(
  lead: OutreachLead,
  personaSlug?: string | null,
  outreachIntent?: string | null,
  skillSlugs?: string[] | null,
): Promise<CopywriterResult>
```

Each skill body is fetched from the `personas` table and prepended to the system prompt as a named block, stacked in order:

```
## Voice Skill: Sean's Voice — Vulnaguard
{body}

## Voice Skill: Subject Line Rules
{body}

---

{COPYWRITER_PROMPT}
```

If both `personaSlug` (sender identity) and `skillSlugs` are provided, persona prepends above the skills block.

### `vulnaguard-marketing-agents/agents/outreach/types.ts`
Add `skill_slugs?: string[] | null` to `OutreachLead`.

### `app/api/marketing/leads/[id]/route.ts`
- Add `"skill_slugs"` to `EDITABLE_FIELDS`.
- No reset logic needed on skill_slugs change (skills don't affect score/status).
- On category change, also reset `skill_slugs` to `[]` (clear stale skill selection alongside score reset).

### `app/api/marketing/leads/[id]/run-ai/route.ts`
- Accept `skill_slugs?: string[]` from the request body.
- Persist `skill_slugs` to the lead row (same pattern as existing `persona_slug` / `outreach_intent` persistence at the top of the handler).
- Pass `skill_slugs` through to `draftSequence`.
- The existing auto-inject of `seans-voice-vulnaguard` when no persona is selected should remain as a fallback **only** when `skill_slugs` is empty — so new leads without any skills selected still get a voice applied.

### `app/api/marketing/pipeline/run/route.ts`
- Also calls `draftSequence` for the automated pipeline path. Update to pass `lead.skill_slugs` so pipeline-driven drafts also respect saved skills.

### `GET /api/marketing/personas?type=voice`
Already supported via existing `typeFilter` query param. No changes needed.

### `POST /api/marketing/personas`
Already accepts `skill_type` in the request body. No changes needed — the Skills tab UI will pass `skill_type: "voice"` when creating a new skill.

---

## UI Changes

### `app/(app)/dashboard/marketing-agents/page.tsx`

#### New "Skills" tab
- Added between "Personas" and "Settings" in the top nav tabs array.
- Tab count badge shows number of voice skills.
- Content: mirrors the Personas tab, but fetches `?type=voice` and labels itself "Voice Skills".
- Header description: *"Skills shape how the AI writes — your tone, subject line style, phrases you use, things you'd never say. Stack multiple skills per draft."*
- **+ New Skill** button opens `PersonaEditorModal` (reused) with `skill_type: "voice"` hardcoded on save.
- Cards show name, slug badge, preview, Edit / Delete — identical pattern to persona cards.
- The seeded "Sean's Voice — Vulnaguard" skill appears here and is editable.

#### `DraftModal` — multi-select skills

Replace the single `<select>` for "Persona / Voice Skill" with two separate controls:

**Outreach Persona** (unchanged, stays a single `<select>`)
- Sender identity, one at a time.

**Voice Skills** (new, replaces the optgroup in the old dropdown)
- Checklist of checkboxes, one per voice skill.
- Pre-checked from the lead's current `skill_slugs` array.
- Selecting/deselecting updates local `selectedSkillSlugs: string[]` state.
- Sent with draft request; saved back to lead on success.

State change in `DraftModal`:
```typescript
// Before
const [selected, setSelected] = useState<string>(lead.persona_slug ?? "");

// After
const [selected, setSelected] = useState<string>(lead.persona_slug ?? "");           // persona
const [selectedSkills, setSelectedSkills] = useState<string[]>(lead.skill_slugs ?? []); // skills
```

#### Pagination

Client-side slice of the already-loaded `filteredLeads` array:

```typescript
const PAGE_SIZE = 25;
const [leadsPage, setLeadsPage] = useState(1);

// Reset page when filters change
useEffect(() => { setLeadsPage(1); }, [leadFilter, categoryFilter]);

const paginatedLeads = filteredLeads.slice((leadsPage - 1) * PAGE_SIZE, leadsPage * PAGE_SIZE);
const totalPages = Math.ceil(filteredLeads.length / PAGE_SIZE);
```

Render `paginatedLeads` instead of `filteredLeads` in the table.

Page controls (rendered below the table when `totalPages > 1`):
```
← Prev    Page 2 of 7    Next →
```
- Small, muted styling consistent with the filter tabs.
- Hidden when `filteredLeads.length ≤ 25`.

#### Table column widths

Add `table-layout: fixed` to the table style and explicit `minWidth` values per column header so long badges ("Relationship Building") and action-button clusters don't collapse:

| Column | minWidth |
|--------|----------|
| Company | 160px |
| Status | 100px |
| Category | 130px |
| Score | 60px |
| CMMC Level | 90px |
| Location | 110px |
| Email | 160px |
| Persona | 100px |
| Actions | 260px |

The `overflowX: auto` wrapper is already present and handles narrow viewports.

---

## Files Changed

| File | Change |
|------|--------|
| `lib/db.ts` | Add `skill_slugs` ALTER TABLE in `ensureSchema()` |
| `vulnaguard-marketing-agents/agents/outreach/types.ts` | Add `skill_slugs` to `OutreachLead` |
| `vulnaguard-marketing-agents/agents/outreach/index.ts` | `draftSequence` accepts + stacks `skillSlugs` array |
| `app/api/marketing/leads/[id]/route.ts` | Add `skill_slugs` to EDITABLE_FIELDS; reset to `[]` on category change |
| `app/api/marketing/leads/[id]/run-ai/route.ts` | Accept + persist `skill_slugs`; pass to `draftSequence`; keep seans-voice fallback when skills empty |
| `app/api/marketing/pipeline/run/route.ts` | Pass `lead.skill_slugs` to `draftSequence` for pipeline-driven drafts |
| `app/(app)/dashboard/marketing-agents/page.tsx` | Skills tab, DraftModal multi-select checklist, pagination, column widths |

---

## Success Criteria

- Voice skills are visible and manageable in a dedicated Skills tab (separate from Personas).
- Selecting multiple skills in the draft modal stacks all their bodies into the system prompt.
- Skill selections are saved on the lead and pre-checked on re-draft.
- Subject line and tone quality improves because Sean's Voice (or any stacked skills) are consistently applied.
- Leads table paginates at 25 rows; page resets when filters change.
- No column content is cut off at any reasonable viewport width.
