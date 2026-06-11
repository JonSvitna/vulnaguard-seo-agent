# Content Pipeline — Production Fix

## Problem

A new Content Pipeline feature (AI social-media post generator at `/content-pipeline`, using `app/api/content-pipeline/{generate,hyperframes}`) was added to the repo with the same class of bug that broke session persistence: its `content_pipeline_records` table was defined in a standalone `psql -f ...` migration file that never runs on Railway, so the table wouldn't exist in production and every generate call would fail. The route was also not linked from any navigation, and a stale duplicate staging copy of the whole feature existed at `/vulnaguard-content-pipeline/`.

## Changes

1. **`lib/db.ts`**: folded `content_pipeline_records` (+ its `brand` and `created_at` indexes) into the `SCHEMA` constant used by `ensureSchema()`, so the table is created automatically on first DB query — same lazy-migration pattern as `sessions`/`messages`/`results`/`inventory`.
2. **`app/dashboard/page.tsx`**: added a "Content Pipeline" nav link next to "Marketing Agents".
3. **Deleted** `/vulnaguard-content-pipeline/` — stale duplicate staging copy (its `content-pipeline.ts` used a `db.query` pattern that didn't match `lib/db.ts`'s actual `query()` export).
4. **Deleted** `vulnaguard-marketing-agents/db/content-pipeline-schema.sql` (superseded by `ensureSchema()`).
5. Updated `CONTENT_PIPELINE.md` to remove the manual migration step and document the new nav entry point.

## Testing

- `npx tsc --noEmit` and `npm run build`
- Manual: visit `/content-pipeline` via the new dashboard nav link, confirm the page loads and (with `ANTHROPIC_API_KEY` set) a generate request succeeds and writes a row to `content_pipeline_records`.

## Note for Marketing Agents Foundation spec

The Foundation spec's Cleanup section (delete `/vulnaguard-marketing-agents/`) must be narrowed to preserve `agents/content-pipeline/` and `pipeline/content-pipeline.ts`, which are live dependencies of this feature.
