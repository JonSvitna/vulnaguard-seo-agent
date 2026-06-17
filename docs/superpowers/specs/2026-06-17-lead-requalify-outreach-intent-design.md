# Lead Requalify + Outreach Intent — Design Spec

**Date:** 2026-06-17

## Problem

1. Leads scored as disqualified by the AI have no explicit "take me back" button. The only workaround was the `force_qualify` flag on the DraftModal — which overrides for a single draft but doesn't change the lead's persistent status.

2. Every AI draft fires with a generic "reach out to this company" framing. No mechanism exists to tell the AI *why* you're contacting this specific lead — whether you want work from them, a partnership, a referral, etc. The result feels like catch-all outreach rather than targeted communication.

## Solution

### Feature 1: Requalify button

A single "Requalify" button visible on disqualified lead cards. Calls `PATCH /api/marketing/leads/[id]` with `{ status: 'qualified' }`, updates the card in place. No modal, no confirmation — disqualified → qualified is low-risk and immediately visible.

No API changes needed; `status` is already in `EDITABLE_FIELDS`.

### Feature 2: Outreach Intent field

**Data model:** Add `outreach_intent TEXT` column to the `leads` table via `ALTER TABLE` in `ensureSchema()`. Add `outreach_intent` to `EDITABLE_FIELDS`.

**UI:** The DraftModal (shown before AI fires) gets a labeled textarea — "What's your goal with this lead?" — pre-populated from `lead.outreach_intent`. Editable inline. On "Draft with AI" click: if the intent field has changed from what's on the lead, PATCH the lead first to persist it, then call `run-ai` with the intent value.

**AI injection:** `run-ai` route passes `outreach_intent` to `draftSequence`. The function injects it into the user-facing prompt as:

```
## Outreach Goal

{outreach_intent}
```

Placed above the lead profile so it sets framing before the AI reads the lead details. No intent = AI behavior unchanged.

## Data Flow

```
DraftModal (intent textarea)
  → PATCH /api/marketing/leads/[id]   (persist intent to leads.outreach_intent)
  → POST  /api/marketing/leads/[id]/run-ai  (pass outreach_intent in body)
    → draftSequence(lead, personaSlug, outreachIntent)
      → userContent = "## Outreach Goal\n{intent}\n\nLead profile:\n..."
      → AI generates targeted emails + LinkedIn message
```

## Files Changed

| File | Change |
|------|--------|
| `lib/db.ts` | ALTER TABLE leads ADD COLUMN IF NOT EXISTS outreach_intent TEXT |
| `app/api/marketing/leads/[id]/route.ts` | Add `outreach_intent` to EDITABLE_FIELDS |
| `app/api/marketing/leads/[id]/run-ai/route.ts` | Accept `outreach_intent` in body, pass to draftSequence |
| `vulnaguard-marketing-agents/agents/outreach/index.ts` | `draftSequence` accepts optional `outreachIntent`, prepends to userContent |
| `app/(app)/dashboard/marketing-agents/page.tsx` | DraftModal: add intent textarea; Requalify button on disqualified cards |

## Out of Scope

- Intent history / audit log
- Preset intent templates (can be added later)
- Intent shown on the send queue or sequence view
