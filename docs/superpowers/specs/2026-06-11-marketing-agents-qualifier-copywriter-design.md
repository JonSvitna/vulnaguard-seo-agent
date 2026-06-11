# Marketing Agents — Qualifier + Copywriter (Sub-spec 2 of 4)

## Problem

The Foundation sub-spec (1 of 4) made the Marketing Agents dashboard fully usable via manual data entry: leads can be added, edited, and given a hand-written sequence (3 emails + LinkedIn message) for approval and sending. There is no AI assistance yet — every score and every word of outreach copy has to be typed by hand.

This sub-spec adds the Qualifier and Copywriter agents as on-demand, per-lead AI actions, using the existing `ANTHROPIC_API_KEY`/`OPENAI_API_KEY` (no new credentials). It follows the "automation with the ability to go manual" principle: AI drafts are always presented for review/edit in the existing sequence editor before anything is saved.

## Agent Module

New directory `vulnaguard-marketing-agents/agents/outreach/`, mirroring the structure of `agents/content-pipeline/`:

- **`systemPrompts.ts`** — two Vulnaguard-specific prompts in Sean's voice/personality (same persona as the content pipeline, repurposed for B2B outreach):
  - `QUALIFIER_PROMPT`: Given a lead's `company_name`, `location`, `org_type`, `cmmc_level_sought`, `employee_count`, `contact_name`, `contact_title`, scores fit for Vulnaguard Sentinel (continuous CMMC compliance monitoring for SMB defense subcontractors) on a 0-10 scale. Higher score for: CMMC Level 2 > Level 1 > unknown; 50-500 employees; defense/IT-services/logistics org types supporting DoD primes; a named contact present. Responds with JSON only: `{ "score": number, "score_reason": "one or two sentence justification" }`.
  - `COPYWRITER_PROMPT`: Given the lead's fields plus its score/score_reason, drafts a 3-touch email sequence and a LinkedIn connection message in Sean's voice — same tone and structure as the existing example sequences in the dashboard (problem → shared experience → soft CTA to `vulnaguard.com/security-health-check`, tapering to a polite final touch). Responds with JSON only: `{ "emails": [{ "touch_number": 1, "subject": "...", "body": "..." }, ...3 total], "linkedin_message": "..." }`.

- **`index.ts`**:
  - `qualifyLead(lead): Promise<{ score: number; score_reason: string }>`
  - `draftSequence(lead): Promise<{ emails: { touch_number: number; subject: string; body: string }[]; linkedin_message: string }>`

  Both are single `anthropic.messages.create` calls (model `claude-sonnet-4-20250514`, same as content pipeline), parsing JSON from the text response with the same `replace(/\`\`\`json|\`\`\`/g, "")` + `JSON.parse` + required-field validation pattern as `agents/content-pipeline/index.ts`.

- **`types.ts`**: `QualifierResult`, `CopywriterResult` matching the shapes above.

## API Route

`POST /api/marketing/leads/[id]/run-ai` (new, `runtime = 'nodejs'`, `dynamic = 'force-dynamic'`):

1. Load the lead. 404 if not found.
2. If `lead.status === 'discovered'`:
   - Call `qualifyLead(lead)`.
   - Read `qualifier_min_score` from `agent_config` (default `6` if missing/unparseable).
   - `UPDATE leads SET score = $score, score_reason = $reason, status = $newStatus, updated_at = NOW()` where `newStatus` is `'qualified'` if `score >= threshold`, else `'disqualified'`.
   - Reload the lead.
3. If (now or already) `lead.status === 'qualified'`:
   - Call `draftSequence(lead)`.
   - Return `{ lead, draft: { emails, linkedin_message } }` — **not persisted**.
4. Otherwise (still `disqualified`, or any other status): return `{ lead, draft: null }`.

Errors from the Anthropic calls return `500` with a generic message, matching the existing content-pipeline routes' error handling.

## Dashboard Wiring (`app/dashboard/marketing-agents/page.tsx`)

**Leads tab actions column**:
- For a lead with `status === 'discovered'`: show a **"Run AI"** button (qualifies, then drafts if it passes).
- For a lead with `status === 'qualified'`: show a **"Draft Sequence (AI)"** button (skips qualification, drafts directly).
- Both call the same `runAI(lead)` handler against `POST /api/marketing/leads/[id]/run-ai`.
- While running, the button shows a spinner/disabled state ("Running...").
- After the call:
  - Refresh the leads list/stats (score, score_reason, status may have changed).
  - If `draft` is non-null, open `SequenceEditorModal` pre-filled with the AI draft.
  - If `draft` is null (disqualified), show a toast with the new status and `score_reason` — no modal.

**`SequenceEditorModal` changes**:
- Add an optional `initialDraft?: { emails: PendingEmail[]; linkedin_message: string }` prop.
- When provided, skip the `GET /api/marketing/leads/[id]` fetch (no `loading` state) and initialize `emails`/`linkedinMessage` directly from `initialDraft`.
- Saving still goes through the existing `PUT /api/marketing/leads/[id]/sequence`, which sets the lead to `drafted` and surfaces it in the Approval Queue — identical to the manual flow from sub-spec 1.

## Testing Plan

- `npx tsc --noEmit` and `npm run build`
- Manual walkthrough in dev (requires `DATABASE_URL` + `ANTHROPIC_API_KEY`):
  1. Add a lead with strong CMMC-fit fields (Level 2, 100 employees, defense org type, named contact) → "Run AI" → verify score ≥ `qualifier_min_score`, status becomes `qualified`, and the sequence editor opens pre-filled with a 3-email draft + LinkedIn message.
  2. Add a weak-fit lead (no CMMC level, unknown org type, no contact) → "Run AI" → verify status becomes `disqualified`, no modal opens, toast shows the reason.
  3. Edit the AI draft in the sequence editor and save → verify it appears in the Approval Queue exactly as a manually-written sequence would.

## Out of Scope (covered by later sub-specs)

- Scout: Apify scraping + LLM entity extraction — sub-spec 3, requires `APIFY_API_KEY`
- Sender: SMTP dispatch automation — sub-spec 4, requires SMTP credentials
- Batch/"run on all leads" automation (`pipeline_runs` population) — still deferred; this sub-spec is per-lead only
