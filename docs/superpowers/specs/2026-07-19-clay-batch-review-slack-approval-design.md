# Clay Batch Scoring, Review, and Slack Approval Design

Date: 2026-07-19
Status: Approved for implementation planning

## Purpose

Turn Clay's broad U.S. small-business sourcing into a daily, low-touch lead
pipeline without creating a second approval system. Clay supplies companies and
contacts, n8n coordinates the batch, and the existing SEO Agent remains the
authoritative system for leads, drafts, approval, and sending.

The workflow runs every day at 6:00 AM America/New_York. It posts a summary to
Slack channel `#clay-leads` when the batch is ready. Sean can approve or reject
the batch in Slack or use the existing SEO Agent Approval Queue. Both surfaces
operate on the same sequence records and API endpoints.

## Goals

- Source 200-300 raw U.S. SMB companies per daily run.
- Score company fit before paid person and email enrichment.
- Enrich only the strongest 25-50 prospects, subject to available matches.
- Import qualified leads as a traceable batch in the existing lead pipeline.
- Draft outreach with the existing Vulnaguard brand, voice, signature, and
  sender identity.
- Review the same batch from the SEO Agent dashboard or `#clay-leads`.
- Require explicit approval before any email sends.
- Preserve existing deduplication, contacted-company checks, daily sending
  limits, approval behavior, and Resend transport.

## Non-goals

- A second lead dashboard or a Slack-owned lead database.
- A new sender identity, brand, signature, or outreach engine.
- Automatic sending without approval.
- Replacing the existing Approval Queue, sequence model, or send queue.
- General CRM functionality.
- Enterprise prospects that exceed Vulnaguard's current delivery capacity.

## Source of truth

PostgreSQL records owned by `vulnaguard-seo-agent` are authoritative for lead,
sequence, approval, and send state. Slack messages contain references to SEO
Agent batch and sequence identifiers; they do not contain independent approval
state. n8n orchestrates work but does not become a lead database.

## Daily data flow

1. At 6:00 AM America/New_York, Clay's scheduled company source starts the daily
   run. A Clay formula assigns a stable batch identifier such as
   `clay-2026-07-20`.
2. Clay supplies up to 200-300 source companies from the approved U.S. SMB
   source. Non-Enterprise Clay cannot be started remotely by n8n, so Clay owns
   this schedule.
3. Deterministic exclusions reject obviously unsuitable records before model
   scoring: missing company identity, enterprise/institutional organizations,
   staffing or recruiting firms, direct service competitors, and companies
   outside the supported size and delivery profile.
4. A Clay AI classification column runs the general-commercial fit rubric on
   the remaining company using its name, description, industry, size, location,
   website, and LinkedIn URL. Keeping this gate in Clay allows subsequent paid
   enrichments to run conditionally; sending unqualified rows to n8n first would
   leave no supported non-Enterprise API for n8n to trigger Clay enrichment.
5. The scorer returns structured output: score, recommended service, short
   reason, and disposition. Records below the configured threshold do not
   proceed to paid contact enrichment.
6. A filtered qualified-company view feeds the linked people source. Qualified
   companies receive one owner-level or problem-owning contact and a validated
   work-email lookup in Clay. The work-email waterfall runs only for qualified
   contacts.
7. Clay posts enriched rows to the n8n intake webhook. n8n validates required
   fields, normalizes the row, attaches the batch metadata, and submits the
   accepted group to the SEO Agent batch-import endpoint.
8. The SEO Agent performs company deduplication and cross-system contacted
   checks, persists accepted leads, and drafts the normal Vulnaguard outreach
   sequence.
9. n8n accumulates arriving rows by batch ID. A separate finalizer runs after
   the configured ingestion window, asks the SEO Agent for authoritative batch
   counts, and posts one summary message to `#clay-leads` when drafting finishes
   or the batch reaches its terminal partial-success state.
10. Sean reviews and approves or rejects from Slack or the existing dashboard.
    Approval uses the current SEO Agent approval route and immediately enters
    the existing sending process. No approval means no sending.

## General-commercial fit scoring

The existing qualifier is CMMC-specific and must remain unchanged for existing
CMMC leads. Clay general-market leads use a separate deterministic-plus-model
scorer.

### Inputs

- Company name and domain
- Company description
- Industry and employee range
- Location
- Company and contact LinkedIn URLs when available
- Contact title when available

### Structured output

```json
{
  "fit_score": 0,
  "recommended_service": "cybersecurity|compliance_cmmc|systems_automation|website_design|none",
  "fit_reason": "Short evidence-based explanation",
  "disposition": "qualify|reject"
}
```

The initial qualification threshold is 70. It is stored in `agent_config` so it
can be tuned without changing code. Model output is schema-validated and
clamped to 0-100. Missing, malformed, or timed-out scoring returns a batch error;
it never silently qualifies a record.

### Deterministic exclusions

- Fortune 500, major public companies, conglomerates, and companies above the
  supported delivery ceiling
- Massive hospitals and health systems, universities and large school systems,
  and government agencies
- Staffing, recruiting, executive-search, job-board, and talent-marketplace
  businesses
- Direct cybersecurity, MSSP, web-design, marketing, software-development,
  IT-consulting, and automation competitors
- Missing company name or usable company identifier

### Positive signals

- Owner-led U.S. small business with a bounded problem
- Missing, outdated, or ineffective website
- Security, risk, policy, or compliance need
- Manual intake, reporting, integration, or operational workflow
- Government-contractor or regulated-industry requirements
- No dedicated senior technical or security function

## Data model

Add nullable fields to `leads` using the repository's existing additive schema
initialization pattern:

- `batch_id TEXT`
- `fit_score INTEGER`
- `fit_reason TEXT`
- `recommended_service TEXT`
- `source_detail TEXT`

Add indexes on `batch_id` and `(category, batch_id)`. Continue using the existing
`category` column, with `clay_leads` as the dedicated category value. Preserve
the existing `business_line` values selected from the scorer's recommended
service. Existing leads and API consumers remain valid because the new fields
are nullable.

## SEO Agent API changes

### Batch import

Extend the existing duplicate-safe import behavior with a JSON batch contract.
The route accepts multiple normalized rows plus shared batch metadata, then
returns counts and per-row outcomes:

- imported
- duplicate
- already contacted
- rejected validation
- drafting succeeded
- drafting failed

The existing CSV import remains compatible. A repeated request with the same
`batch_id` and company must not create another lead or sequence.

### Batch summary

Add a read endpoint keyed by `batch_id`. It returns aggregate counts, service
breakdown, score range, and a limited set of draft previews. It does not expose
secrets or full provider responses.

### Approval

Reuse the existing approval and rejection implementation. Extend the routes to
accept a `batch_id` in addition to explicit sequence IDs. Resolve eligible
drafted sequences server-side, in one transaction, then call the existing send
path. Repeated approve or reject actions are idempotent and return the current
batch state.

## Dashboard changes

Do not create a new dashboard. Extend the current Lead Pipeline and Approval
Queue with:

- `Clay Leads` category filter
- Batch ID filter
- Fit score and recommended-service badges
- Fit-reason text on lead and approval cards
- Company website and LinkedIn links
- Batch-level selection and existing bulk approve/reject controls

The existing Vulnaguard persona, copywriter, email signature, sender domain,
sequence generation, and daily send limit continue unchanged.

## Slack notification and approval

The existing Slack app posts one message per completed batch to `#clay-leads`.
The message includes:

- Batch ID and run time
- Raw sourced, rule-rejected, scored, enrichment-attempted, email-validated,
  imported, duplicate, drafted, and failed counts
- Service-line breakdown and fit-score range
- Up to three representative email previews
- Link to the SEO Agent Approval Queue filtered to the batch
- `Approve Batch` and `Reject Batch` interactive buttons

Slack interactivity posts signed actions to an n8n webhook. The webhook verifies
the Slack signature and timestamp, checks the permitted channel and user,
acknowledges within Slack's required response window, then calls the SEO Agent
batch approval or rejection endpoint. n8n updates the original Slack message
with the authoritative API result. A repeated click reports the already-applied
state rather than sending twice.

If Slack interactivity is unavailable, the dashboard remains fully functional.
The workflow reports the notification failure in n8n without changing lead or
approval state.

## Scheduling

- Clay source schedule: every calendar day at 6:00 AM America/New_York
- n8n batch finalizer schedule: every calendar day at 7:00 AM
  America/New_York, providing a one-hour ingestion and drafting window
- Clay owns sourcing and conditional enrichment; n8n owns intake, finalization,
  notification, and Slack interaction handling
- Only one active run per daily batch ID
- A repeated row, finalizer, or interaction for the same batch exits safely
  without duplicating leads, notifications, approvals, or sends
- Both schedules remain disabled until the end-to-end test passes

## Failure handling

- Invalid or missing work emails never enter drafting.
- Partial batches remain visible with exact counts and error summaries.
- Scoring failures do not default to qualification.
- Provider and Slack failures use bounded retries; permanent failures are
  recorded once and surfaced in the batch summary.
- SEO Agent deduplication and contacted-company checks remain final authority.
- Approval is required even when every technical step succeeds.
- Existing daily send limits and Resend rate controls remain final send gates.

## Security

- Keep Slack, Clay, n8n, and SEO Agent credentials in their existing credential
  stores or deployment environment; never put them in workflow JSON or Slack
  messages.
- Verify Slack signing secret signatures and reject stale interaction requests.
- Authorize Slack approval actions to the configured channel and permitted user.
- Protect new batch mutation endpoints with a shared service credential.
- Do not expose contact lists through unauthenticated batch-summary endpoints.

## Verification plan

1. Unit-test deterministic exclusions and structured scoring validation.
2. Use the reviewed 10-contact Clay sample as a regression fixture: the eight
   known weak or invalid candidates must not reach enrichment/drafting, while
   the two plausible candidates remain eligible for human review.
3. Verify batch-import idempotency, company deduplication, already-contacted
   rejection, and partial failure reporting.
4. Verify the existing CMMC qualifier and CSV import behavior remain unchanged.
5. Run a new 10-company end-to-end test through Clay, n8n, SEO Agent drafting,
   Slack summary, Slack approval/rejection, and the dashboard batch filter.
6. Confirm a repeated Slack approval cannot schedule or send twice.
7. Confirm no approval produces no sends.
8. Confirm daily send limits still cap an approved batch.
9. Activate the 6:00 AM Clay source and 7:00 AM n8n finalizer schedules only
   after all checks pass.

## Success criteria

- Sean performs routine review in one existing Approval Queue or directly from
  the corresponding Slack batch message.
- No lead requires manual movement from Clay to the SEO Agent.
- Paid email enrichment is limited to automatically qualified prospects.
- Slack and the dashboard always report the same authoritative batch state.
- Every send is explicitly approved and uses the existing Vulnaguard identity.
- Duplicate trigger, import, and approval requests do not duplicate leads,
  sequences, or sends.
