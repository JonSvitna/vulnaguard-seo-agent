# Marketing Agents — Sender (Send Queue) (Sub-spec 4 of 4)

## Problem

The original Python Sender agent dispatched approved sequences via SMTP. There are no SMTP credentials available, so a faithful port would ship disabled and provide no immediate value — the same situation Scout and HyperFrames were in.

Following that precedent: instead of porting the SMTP-gated send step as dead code, this sub-spec builds the useful half — a **Send Queue**. Approved sequences get their per-touch send dates computed automatically (using the existing `sequence_delay_days` config). The dashboard surfaces what's due to send today with copy-ready email content, and a one-click "Mark Sent" per touch. The user sends manually via their own email client (Gmail/Outlook/etc.) and the system tracks progress. If SMTP credentials are added later, the same `scheduled_at`/`status` model on `emails` is exactly what an automated sender would consume — this sub-spec just keeps the human in the loop on the final transport step.

## Scheduling on Approval

`POST /api/marketing/approval/approve` (existing route) is extended:

- For each sequence being approved, set `sequences.approved_at = NOW()`.
- For its emails, set `scheduled_at`:
  - Touch 1: `NOW()` (due immediately)
  - Touch 2: `NOW() + delay[0] days`
  - Touch 3: `NOW() + delay[1] days`
  - where `[delay[0], delay[1]]` comes from parsing `agent_config.sequence_delay_days` (format `"4,9"`, default `[4, 9]` if missing/malformed — both offsets are from the approval date, not cumulative from the previous touch)

This is additive to the existing approve logic (which already sets `sequences.status = 'approved'` and `leads.status = 'approved'`).

## API Routes

- **`GET /api/marketing/send-queue`** (new, `runtime = 'nodejs'`, `dynamic = 'force-dynamic'`): returns emails where `status = 'drafted'` AND the parent sequence's `status = 'approved'`, joined with lead info (`company_name`, `contact_name`, `contact_email`, `contact_linkedin`) and the sequence's `linkedin_message` (for touch 1 only). Split into:
  - `due`: `scheduled_at <= NOW()`, ordered by `scheduled_at ASC`
  - `upcoming`: `scheduled_at > NOW()`, ordered by `scheduled_at ASC`

- **`POST /api/marketing/emails/[id]/mark-sent`** (new): marks one email as `status = 'sent'`, `sent_at = NOW()`. Then checks if any other emails for that `sequence_id` still have `status = 'drafted'`:
  - If none remain, update the sequence and its lead to `status = 'sent'` (same as the existing `/api/marketing/sequences/[id]/mark-sent` does for the whole sequence at once).
  - If some remain, leave sequence/lead status unchanged.

The existing `/api/marketing/sequences/[id]/mark-sent` route (whole-sequence, used for manually-entered leads that skip the queue) is unchanged.

## Dashboard Wiring (`app/dashboard/marketing-agents/page.tsx`)

**New "Send Queue" tab** (added to `TABS`, between "Approval Queue" and "Pipeline"), badge count = number of `due` items:

- **Due section**: each item is a card showing company name, contact name, touch number, subject, and body (read-only, same styling as `EmailTouch`). For touch 1, also show the LinkedIn message in a secondary block. Two buttons:
  - **"Copy Email"**: copies `To: <contact_email>\nSubject: <subject>\n\n<body>` to the clipboard via `navigator.clipboard.writeText`, shows a toast ("Copied to clipboard")
  - **"Mark Sent"**: calls `POST /api/marketing/emails/[id]/mark-sent`, removes the item from the queue, refreshes stats/leads
- **Upcoming section**: collapsed/grayed list showing company name, touch number, and `scheduled_at` date (e.g. "Touch 2 — due in 3 days"). No actions.
- Empty state: "Nothing due right now" / "All caught up."

**Leads tab**: unchanged — the existing whole-sequence "Mark Sent" button (shown when `status === 'approved'`) remains as a fallback for sequences created/approved before this feature or for manually-entered leads.

## Testing Plan

- `npx tsc --noEmit` and `npm run build`
- Manual walkthrough in dev (requires `DATABASE_URL`):
  1. Create a lead, draft a sequence (manually or via AI), approve it → verify in the DB that `sequences.approved_at` and each email's `scheduled_at` are set correctly (touch 1 ≈ now, touch 2/3 offset by `sequence_delay_days`).
  2. Open Send Queue → verify touch 1 appears under "Due" with correct subject/body/LinkedIn message, and touches 2/3 appear under "Upcoming" with future dates.
  3. Click "Copy Email" → verify clipboard contains `To/Subject/Body` formatted text and a toast confirms.
  4. Click "Mark Sent" on touch 1 → verify it disappears from Due, the lead's status remains `approved` (touches 2/3 still drafted).
  5. Manually update touch 2/3 `scheduled_at` to the past (or mark all sent) → verify after the last touch is marked sent, the sequence and lead both flip to `sent` and the lead disappears from future Send Queue results.

## Out of Scope

- Actual SMTP/email transport — if credentials are added later, a follow-up can add an automated sender that processes the same `due` query and calls the same `mark-sent` endpoint after a successful send
- Reply tracking / inbox monitoring (`replied` status transition) — remains manual via the existing lead Edit modal
