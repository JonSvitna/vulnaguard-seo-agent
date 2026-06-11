# Marketing Agents — Scout (Bulk Import) (Sub-spec 3 of 4)

## Problem

The original Python Scout agent scraped the CMMC-AB Marketplace via Apify and used spaCy to extract structured lead fields. There's no `APIFY_API_KEY` available, so a faithful port would ship disabled and provide no immediate value — the same situation HyperFrames was in for the Content Pipeline's Video tab.

Following that precedent: instead of porting the Apify-gated flow as dead code, this sub-spec builds the useful half — an LLM-based **bulk import**. The user pastes raw text (copied from the CMMC-AB Marketplace, a directory listing, a spreadsheet, an email, anything with company info in it), and an LLM extracts structured leads and inserts them as `discovered`. No new credentials required — uses the existing `ANTHROPIC_API_KEY`.

The extraction agent (`extractLeads`) is written so that if `APIFY_API_KEY` is added later, a scrape step can feed its raw output into the same function — the LLM-extraction half of Scout is fully reusable either way.

## Agent Module

New directory `vulnaguard-marketing-agents/agents/scout/`, mirroring `agents/outreach/`:

- **`systemPrompts.ts`** — `EXTRACTOR_PROMPT`: Given a block of raw text, identify every distinct organization mentioned that looks like a potential CMMC compliance customer (a defense subcontractor, IT services / logistics / manufacturing company supporting DoD primes — NOT a C3PAO, RPO, consultant, or assessor organization, which should be skipped). For each, extract:
  - `company_name` (required — skip entries with no identifiable company name)
  - `website`, `location`, `org_type`, `cmmc_level_sought` (normalize to `"Level 1"`, `"Level 2"`, `"Level 3"`, or `"Unknown"`), `employee_count`, `contact_name`, `contact_title`, `contact_email`, `contact_linkedin` — `null` if not present in the text
  - Cap at 25 companies per call (enough for any reasonably-sized paste; keeps `max_tokens` bounded)

  Responds with JSON only: `{ "leads": [ { "company_name": "...", "website": null, ... }, ... ] }`

- **`types.ts`**: `ExtractedLead` (all the fields above).

- **`index.ts`**: `extractLeads(rawText: string): Promise<ExtractedLead[]>` — single `anthropic.messages.create` call (model `claude-sonnet-4-20250514`, `max_tokens: 4000`), same JSON-fence-stripping + parse + validate pattern as `agents/outreach/index.ts`. Throws if `rawText` is empty/whitespace, or if the response is malformed. Returns `[]` (not an error) if the model finds no matching companies.

## API Route

`POST /api/marketing/scout/import` (new, `runtime = 'nodejs'`, `dynamic = 'force-dynamic'`):

1. Body: `{ raw_text: string }`. 400 if empty/whitespace.
2. Call `extractLeads(raw_text)`.
3. For each extracted lead, skip if a lead with the same `company_name` already exists (case-insensitive exact match via `LOWER(company_name) = LOWER($1)`).
4. Insert remaining leads: `source = 'scout_import'`, `status = 'discovered'`, `score = 0`.
5. Insert one `pipeline_runs` row: `agent = 'scout'`, `status = 'success'`, `leads_processed = <inserted count>`, `details = { extracted: <total found>, imported: <inserted count>, skipped_duplicates: <dupes> }`, `finished_at = NOW()`.
6. Return `{ extracted: number, imported: number, skipped_duplicates: number, leads: Lead[] }` (the newly inserted leads).

On `extractLeads` failure: still insert a `pipeline_runs` row with `status = 'error'` and `details = { error: <message> }`, then return 500 with a generic error message.

## Dashboard Wiring (`app/dashboard/marketing-agents/page.tsx`)

**Pipeline tab**: add a new "Bulk Import (AI)" card above the existing "Full Pipeline" / "Send Approved" cards (which remain disabled/COMING SOON, unchanged):

- A `<textarea>` for pasting raw text (placeholder: "Paste company listings, directory text, or notes here...")
- An "Import Leads" button — disabled while empty or while a request is in flight (shows "Importing...")
- On success: show a toast ("Imported N leads (M duplicates skipped)"), clear the textarea, and `refreshAll()` so the new leads appear in the Leads tab and the run shows up in Recent Runs (now populated for the first time since `pipeline_runs` exists).
- On error: toast with the error message, no state changes.

No changes to `SequenceEditorModal`, `LeadModal`, or other tabs.

## Testing Plan

- `npx tsc --noEmit` and `npm run build`
- Manual walkthrough in dev (requires `DATABASE_URL` + `ANTHROPIC_API_KEY`):
  1. Paste a block of text describing 2-3 fictional defense subcontractors (varying CMMC levels, with and without contact info) plus one RPO/consultant → Import → verify the RPO is excluded, the others appear in the Leads tab as `discovered` with `score = 0` and `source = 'scout_import'`.
  2. Re-paste the same text → verify duplicates are skipped (toast shows 0 imported, N duplicates skipped) and no new rows are created.
  3. Verify a row appears in Pipeline → Recent Runs with agent `scout`, status `success`, and the correct `leads_processed` count.
  4. Paste text with no company-like content → verify `{ extracted: 0, imported: 0 }` and a friendly toast, no error.

## Out of Scope

- Apify-based scraping itself — if `APIFY_API_KEY` is added later, a follow-up can add a scrape step that feeds raw page text into `extractLeads`, reusing this same module and route (or a thin wrapper around it)
- Sender: SMTP dispatch automation — sub-spec 4, requires SMTP credentials
- Running the Qualifier automatically on imported leads — imported leads land as `discovered`, same as manually-entered leads, and use the existing per-lead "Run AI" action from sub-spec 2
