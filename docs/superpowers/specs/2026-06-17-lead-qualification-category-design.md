# Lead Qualification Category — Design Spec

**Date:** 2026-06-17

## Problem

`qualifyLead()` scores every lead against a single hardcoded rubric (`QUALIFIER_PROMPT` in `vulnaguard-marketing-agents/agents/outreach/systemPrompts.ts`) — fit for Vulnaguard Sentinel as a direct sale. There's no way to tell the system *what kind of lead this is for* (a sales prospect vs. a potential partner vs. someone worth building a relationship with), so every lead gets scored and pitched the same way regardless of intent. There's also no way to group imported leads into lists by that intent.

Two existing fields look similar but don't solve this: `persona_slug` (who's sending the outreach) and `outreach_intent` (free-text goal) both only affect the copywriter step, never the qualification score.

## Solution

### Data model

Add a `category` column to `leads`, a fixed enum with four values: `sales` (default — matches today's behavior exactly), `partnership`, `relationship_building`, `referral`.

```sql
ALTER TABLE leads ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'sales';
CREATE INDEX IF NOT EXISTS idx_leads_category ON leads (category);
```

Add `category?: string` to `OutreachLead` (`vulnaguard-marketing-agents/agents/outreach/types.ts`). Add `"category"` to `EDITABLE_FIELDS` in `app/api/marketing/leads/[id]/route.ts` for read/display purposes (write path has a special case — see below).

### Qualification rubrics per category

`systemPrompts.ts` exports a map instead of one fixed prompt:

```typescript
export const QUALIFIER_PROMPTS: Record<string, string> = {
  sales: QUALIFIER_PROMPT_SALES,           // today's existing rubric, verbatim
  partnership: QUALIFIER_PROMPT_PARTNERSHIP,
  relationship_building: QUALIFIER_PROMPT_RELATIONSHIP,
  referral: QUALIFIER_PROMPT_REFERRAL,
};
export const CATEGORY_LABELS: Record<string, string> = {
  sales: "Sales",
  partnership: "Partnership",
  relationship_building: "Relationship Building",
  referral: "Referral",
};
```

- **`sales`** — unchanged: CMMC level, employee count 50-500, defense-adjacent org type, named reachable contact.
- **`partnership`** — score higher for complementary, non-competing service providers (MSPs, compliance consultants/auditors, IT integrators) that serve the same small/mid defense-subcontractor customer base and have an established client base worth referring or co-selling to. Score lower for direct competitors or companies with no overlapping customer base.
- **`relationship_building`** — score higher for community presence and reachability: active LinkedIn, a title suggesting peer influence (association lead, frequent speaker/poster, community organizer) within the defense/compliance/security space. CMMC level and employee count carry little weight here — this is about staying visible in the right circles, not closing a deal.
- **`referral`** — score higher for a wide professional network within the target industry (DoD primes, defense subcontractor community) who would encounter many potential Sentinel customers but don't need it themselves — e.g. independent consultants, conference/association organizers, well-connected individuals without a competing service of their own. Score lower if they already fit `sales` or `partnership` better (a direct prospect or a competing service provider isn't a referral source), or if they have a narrow/local network.

`qualifyLead(lead)` (`vulnaguard-marketing-agents/agents/outreach/index.ts:57`) selects the rubric via `QUALIFIER_PROMPTS[lead.category ?? "sales"] ?? QUALIFIER_PROMPTS.sales`. No signature change — `qualifyAndUpdateLead` already passes the full lead row through `runAgent`, so `lead.category` is already present by the time it reaches `qualifyLead`.

### Category-aware copy

`draftSequence()` (`outreach/index.ts:68`) gets a small context map injected above the lead profile, the same mechanism used for `outreach_intent` today:

```typescript
const CATEGORY_CONTEXT: Record<string, string> = {
  partnership: "This is a potential partner relationship, not a direct sale. Frame outreach around collaboration and mutual client benefit, not a pitch to buy Sentinel.",
  relationship_building: "This is relationship/community outreach — no ask, no CTA pressure. Focus on genuine connection and shared context, not a product pitch.",
  referral: "This is a referral relationship — the goal is an introduction or visibility within their network, not a direct sale or partnership. Frame outreach around asking them to keep Sentinel in mind for people they encounter, not a pitch to buy or partner.",
};
```

`sales` (or missing category) injects nothing — today's `COPYWRITER_PROMPT` behavior is unchanged. The category section is placed above the `outreach_intent` section so intent (more specific, per-lead) can further refine the category framing (per-batch, broader) when both are present.

### Import flow — asking the category

Three entry points get a required category dropdown, defaulted to **Sales**:

1. **Text-paste import** (Scout): dropdown next to the existing textarea. New `category` field sent in `POST /api/marketing/scout/import` body; applied to every lead extracted from that paste before the insert.
2. **CSV/Excel import**: dropdown on the Mapping Review screen, next to the existing "Outreach Persona (optional)" selector. New `category` field sent in `POST /api/marketing/leads/import-confirm` body; applied to every row in that batch's insert.
3. **Manual lead creation** (single-lead add form): dropdown added alongside the existing Status dropdown, default Sales.

All three insert statements add `category` as a column with the selected value, written before `qualifyAndUpdateLead` runs — so the first qualification pass already uses the correct rubric.

### Lists / dashboard organization

- New row of category filter tabs (`All / Sales / Partnership / Relationship Building / Referral`) on the Lead Pipeline section, next to the existing status filter tabs — same visual/interaction pattern as the `STATUS_OPTIONS` tabs (`leadFilter` state). New `categoryFilter` client state filters the already-fetched leads list; no new API endpoint needed.
- Each lead card displays a category badge next to its existing status badge.

### Category change on an existing lead

Changing `category` on a lead that's already been scored invalidates that score (it was computed against a different rubric). `PATCH /api/marketing/leads/[id]` gets a special case: when the request body includes `category` and it differs from the current value, the update also sets `status = 'discovered'`, `score = 0`, `score_reason = NULL` in the same statement — rather than treating `category` as a plain field in the generic `EDITABLE_FIELDS` loop. This routes the lead back through the existing "discovered → auto-qualify on next AI run" path (`run-ai/route.ts:33`), now scored under the new rubric.

## Data Flow

```
Import (text/CSV/manual)
  → category selected (required, default 'sales')
  → INSERT lead with category
  → qualifyAndUpdateLead(lead)
      → qualifyLead reads lead.category → picks rubric → scores
  → status: qualified | disqualified

Dashboard
  → category filter tabs (alongside status tabs) → scoped list view

Draft (AI run)
  → draftSequence injects CATEGORY_CONTEXT[lead.category] above lead profile
  → sales: no change · partnership/relationship_building: reframed copy

Edit existing lead → change category
  → PATCH detects category diff → reset status/score → re-qualifies on next AI run
```

## Files Changed

| File | Change |
|------|--------|
| `lib/db.ts` | `ALTER TABLE leads ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'sales'` + index |
| `vulnaguard-marketing-agents/agents/outreach/types.ts` | Add `category?: string` to `OutreachLead` |
| `vulnaguard-marketing-agents/agents/outreach/systemPrompts.ts` | Split `QUALIFIER_PROMPT` into `QUALIFIER_PROMPTS` map (sales/partnership/relationship_building) + `CATEGORY_LABELS`; add `CATEGORY_CONTEXT` map for copywriter |
| `vulnaguard-marketing-agents/agents/outreach/index.ts` | `qualifyLead` selects rubric by `lead.category`; `draftSequence` injects category context |
| `app/api/marketing/scout/import/route.ts` | Accept `category` in body, write to INSERT |
| `app/api/marketing/leads/import-confirm/route.ts` | Accept `category` in body, write to INSERT |
| `app/api/marketing/leads/route.ts` (manual create) | Accept `category` in body, write to INSERT |
| `app/api/marketing/leads/[id]/route.ts` | `category` in `EDITABLE_FIELDS`; special-case PATCH to reset status/score when category changes |
| `app/(app)/dashboard/marketing-agents/page.tsx` | Category dropdown on text-import panel, CSV mapping review, manual add form; category filter tabs; category badge on lead cards |

## Out of Scope

- User-managed/custom category list (fixed 4-value enum for now)
- Category history/audit log
- Bulk re-categorization of multiple leads at once
- Changing the `qualifier_min_score` threshold per category (single global threshold stays in `agent_config`)
