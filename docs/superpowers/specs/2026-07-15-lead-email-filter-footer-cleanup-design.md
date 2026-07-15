# Lead Email Filter + Commercial Footer Cleanup

Date: 2026-07-15
Scope: Marketing Agents Leads + Approval contact filters; commercial_security email footers

## Context

Operators cannot browse or select only emailable leads. Existing filters cover status, category, and business line, but not whether `contact_email` is present. Batch send already skips LinkedIn-only leads server-side; the gap is pre-filtering in the UI so approved/sent work targets real email contacts.

Commercial Security drafts append a pipe-delimited CAN-SPAM one-liner with a residential street address and “Reply STOP to opt out.” That reads like blast mail and hurts deliverability/trust. CMMC and website_dev lines use a short signoff only.

## Goals

1. Add **Has email** / **No email** contact filters on the Leads table and the Approval Queue.
2. Replace the commercial_security spammy footer with a soft legal ending for all new drafts.
3. One-shot rewrite existing **unsent** commercial drafts for leads that have `contact_email`; leave LinkedIn-only and `sent` history alone.
4. Keep the STOP/unsubscribe inbox poller working with the softer opt-out language.

## Non-Goals

1. No API `has_email` query param or schema/migration (`contact_method` column).
2. No changes to CMMC or website_dev signoffs.
3. No bulk “draft/send selected” from Leads multi-select.
4. No broader SEO-agent rewrite beyond these two problems.

## Decisions (approved)

| Decision | Choice |
|---|---|
| Filter surfaces | Leads table **and** Approval Queue |
| Contact chips | All / Has email / No email only |
| Approach | Client-side filters (match status/category pattern); no schema change |
| New footer style | Soft legal |
| Existing drafts | Rewrite unsent email-contact drafts only; skip LinkedIn-only |

## Design

### 1. Contact filters

**Definition**

- **Has email** = `contact_email` is a non-empty string after trim
- **No email** = null, undefined, or blank/whitespace

**Leads tab** (`app/(app)/dashboard/marketing-agents/page.tsx`)

- Add a contact filter chip row next to existing status / category / business_line chips
- Values: `all` | `has_email` | `no_email` (default `all`)
- Apply in the existing client-side filter pipeline with AND semantics alongside status, category, business_line, and text search

**Approval Queue** (same page)

- Same contact chip control
- Filter pending sequences by associated lead email presence
- When **Has email** is on, LinkedIn-only cards (“No email — LinkedIn only”) are hidden

No changes to `GET /api/marketing/leads` or approval pending API query params this pass.

### 2. Soft legal footer

**New commercial_security ending**

```
Sean
Vulnaguard LLC

Vulnaguard LLC · Owings Mills, MD
If you’d rather not hear from us, reply “unsubscribe”.
```

**Wiring**

1. Update prompt requirements/examples in `vulnaguard-marketing-agents/agents/outreach/systemPrompts.ts`
2. Update `COMMERCIAL_SECURITY_FOOTER` / `ensureCommercialSecurityFooter` in `vulnaguard-marketing-agents/agents/outreach/index.ts`
3. Mirror the string in `scripts/bulk-draft-qualified.mjs`

Resend send path does not append footers; stored draft body is the source of truth. No change to `lib/email.ts`.

**Opt-out**

`lib/check-stop-replies.ts` already matches `unsubscribe` / stop / opt-out phrases. Soft language remains enforceable via the inbox poller.

### 3. One-shot rewrite of existing drafts

New script: `scripts/rewrite-commercial-footers.mjs`

**Selection (all must match)**

- Lead `business_line = 'commercial_security'` (or draft known to contain the old footer)
- Lead has non-empty `contact_email`
- Email row status is unsent (`drafted` or approved-but-not-sent — whatever statuses mean “still editable before/during queue”; exclude `sent` and cancelled)
- Body contains the old pipe footer (or `---` + old line)

**Action**

- Strip the old `---` + pipe STOP footer (and duplicate old footers if present)
- Ensure soft legal footer is present once via the same ensure helper logic
- Default dry-run mode that prints counts; `--apply` writes updates

**Skip**

- Leads with null/blank `contact_email` (LinkedIn-only)
- `sent` email history
- Bodies that already have only the new soft footer

## Files

| File | Change |
|---|---|
| `app/(app)/dashboard/marketing-agents/page.tsx` | Contact filter state + chip UI + filter logic (Leads + Approval) |
| `vulnaguard-marketing-agents/agents/outreach/systemPrompts.ts` | Soft footer in commercial prompt |
| `vulnaguard-marketing-agents/agents/outreach/index.ts` | `ensureCommercialSecurityFooter` string |
| `scripts/bulk-draft-qualified.mjs` | Mirror footer string |
| `scripts/rewrite-commercial-footers.mjs` | New one-shot rewrite (dry-run / `--apply`) |

## Verification

1. Leads: **Has email** hides blank-email rows; **No email** hides emailed rows; combines with status filter.
2. Approval: same contact filter; LinkedIn-only cards hidden under **Has email**.
3. Generate a new commercial_security draft → body ends with soft legal footer, not the pipe STOP line.
4. Rewrite dry-run counts only email-contact unsent commercial drafts; skips LinkedIn-only and sent.
5. Rewrite `--apply` updates those bodies; re-run dry-run shows zero remaining old footers among email-contact unsent.

## Success criteria

- Operator can select **Has email**, multi-select those leads, and move through approve → release → send without LinkedIn-only noise.
- Outbound commercial email no longer carries the residential address + “Reply STOP” pipe line.
- Existing emailable unsent drafts are cleaned before the next send batch.
