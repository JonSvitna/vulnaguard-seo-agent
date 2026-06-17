# Outreach Polish — Design Spec

**Date:** 2026-06-17

## Problems

1. Sequence editor modal does not appear after AI draft completes.
2. No way to AI-generate a persona/voice skill body — user must type it from scratch.
3. Resend API key set on Railway but frontend always shows "not configured."
4. Voice skills are not selectable in the DraftModal — outreach emails can't use them.
5. Outreach email copy still reads as AI-generated despite prompt guidelines.

---

## Section 1 — Sequence modal timing fix

**Root cause:** `executeDraft` calls `await refreshAll()` before `setSequenceModal(...)`. React 18 batches state updates from the four concurrent fetches inside `refreshAll`. The component re-renders from the refresh before `setSequenceModal` fires, and the modal either races or the stale closure loses the draft reference.

**Fix:** Swap the order — call `setSequenceModal(...)` *first*, then fire `refreshAll()` in the background (non-awaited, or awaited after). The draft is already in hand; the refresh only updates the leads list and stats.

**Fallback:** If `data.draft` is null (lead was disqualified mid-run), show a descriptive toast: `"Lead scored X/10 — disqualified. Use Override & Draft or Requalify to force a sequence."` Currently nothing happens.

## Section 2 — AI-assisted persona body drafting

**Where:** PersonaEditorModal (marketing Personas tab) and the Voice Skills modal (content pipeline).

**UX:**
- Add a "Describe your style" text area above the body textarea (placeholder: *"e.g. direct, no corporate speak, first-person practitioner who's been through audits..."*)
- "Write with AI" button next to it — calls `POST /api/marketing/personas/draft-ai`
- Button shows spinner, then auto-fills the body textarea with the result
- User reviews and edits before saving — nothing is auto-saved

**New endpoint:** `POST /api/marketing/personas/draft-ai`
- Body: `{ description: string, skill_type: "persona" | "voice" }`
- Uses `getProviderForAgent('default')` for the AI call
- System prompt instructs AI to produce a structured document with: tone overview, writing philosophy, phrases to use, phrases to avoid, 3 example sentences
- Returns `{ ok: true, body: string }`

## Section 3a — Resend config diagnostic

**Fix:** Add a "Recheck" button on the Settings tab next to the Resend status indicator. Clicking it re-fetches `/api/marketing/config` live and updates `resendConfigured` state. This surfaces whether the issue is a stale page load vs. a genuine missing key.

Also improve the status text: instead of just "✓ set" / warning banner, show the exact env var name being checked (`RESEND_API_KEY`) so the user can verify naming on Railway.

## Section 3b — Voice skills in DraftModal

**Fix:** DraftModal currently fetches `/api/marketing/personas` (no type filter), which already returns all records. Change the dropdown to group results:
- If `skill_type === 'persona'` → under "Outreach Personas" optgroup
- If `skill_type === 'voice'` → under "Voice Skills" optgroup

The selected slug (persona or voice skill) is passed to `run-ai` as `persona_slug` identically to today — the outreach agent already prepends the body as `## Sender Persona`.

## Section 4 — Email copy quality

**Two changes to `COPYWRITER_PROMPT`:**

1. Extend the NEVER list with AI-tell phrases:
   - "I hope this email finds you well"
   - "I wanted to reach out"
   - "I'm excited to share"
   - "revolutionize" / "game-changing" / "seamlessly" / "delve into" / "leverage" / "utilize"
   - "As an AI language model" (obvious but add it)
   - Any sentence starting with "I am writing to"

2. Add a hard-format constraint: each email body must be ≤ 150 words. Short emails don't read as AI. Force brevity.

**Auto-inject default voice skill:** On the `run-ai` route, after loading the lead, query the DB for a voice skill with slug `seans-voice-vulnaguard`. If found and no persona was explicitly selected, prepend its body to the system prompt as `## Voice\n\n{body}`. This means every Vulnaguard draft gets Sean's voice applied automatically — no manual selection needed.

---

## Files Changed

| File | Change |
|------|--------|
| `app/(app)/dashboard/marketing-agents/page.tsx` | Fix `executeDraft` order; add Recheck button; group voice skills in DraftModal dropdown; add AI-write button + description field in PersonaEditorModal |
| `app/api/marketing/personas/draft-ai/route.ts` | NEW — AI-generate persona body |
| `app/api/marketing/leads/[id]/run-ai/route.ts` | Auto-inject `seans-voice-vulnaguard` when no persona selected |
| `vulnaguard-marketing-agents/agents/outreach/systemPrompts.ts` | Extend NEVER list; add 150-word cap instruction |

## Out of Scope

- Multiple skills per draft (future)
- Drag and drop persona assignment (future)
