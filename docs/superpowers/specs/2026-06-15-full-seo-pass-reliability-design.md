# Full SEO Pass Reliability — Design

## Context

Running a "Full SEO Pass" (M1→M6) on `/dashboard` has several reliability problems that make it feel like it "stalls" and that pushes to GitHub are unreliable:

1. Module responses (especially M1, M5, M6) can be truncated mid-output with no error, because the agent route caps `max_tokens` at 4096 — far below what a full keyword strategy doc or a zipper blog+service-page file pair needs.
2. Truncation of M5's output means `parseFileBlocks()` (which requires a closed ` ```file:... ``` ` fence) only finds the first of two files — surfacing as "only 1 page available to push" when more were generated.
3. There's no way to verify, from the running app, whether the configured GitHub token actually has push access to each site's repo — diagnosing push issues currently requires manual API calls.
4. Error banners (including push failures) auto-dismiss after 6-8 seconds, making it hard to read/report the actual error.
5. `setPendingFiles(files)` replaces the pending list on every module run instead of accumulating, so a multi-module pass (e.g. M4 edits + M5 new pages) only pushes the *last* module's files in one commit — earlier files are dropped from that push and only resurface via the reload-recovery banner.

(Live GitHub push mechanics — `writeRepoFilesSingleCommit`, token resolution, commit/ref updates — were verified working end-to-end against `JonSvitna/vulnaguard-site` during this design process. No fix needed there.)

## Fixes

### A. Raise `max_tokens`
In [app/api/agent/route.ts](app/api/agent/route.ts#L44) and [:80](app/api/agent/route.ts#L80):
- Anthropic (`claude-sonnet-4-6`): `4096` → `16000`
- OpenAI (`gpt-4o`): `4096` → `16384`

No other changes needed — `parseFileBlocks`, `extractPhaseMarker`, and the streaming loop already handle longer `fullResponse` strings correctly.

### B. GitHub connection health check
New `app/api/github/health/route.ts`, following the pattern of `app/api/health/db/route.ts`: for each site in `SITES`, call `octokit.repos.get({ owner, repo })` with the resolved token and report per-site `{ site, ok, push: boolean, error? }`.

Surfaced in [Settings](app/(app)/settings/page.tsx) as a new "GitHub Connections" card below the existing "Session Persistence (Database)" card — one row per site, ✓/✗ styling matching the existing DB status card, showing the Octokit error message on failure.

### C. Stop auto-dismissing error banners
In [page.tsx](app/(app)/dashboard/page.tsx#L477) and [:510](app/(app)/dashboard/page.tsx#L510): only `setTimeout(() => setDeployStatus(null), ...)` for `type === 'success'`. Error-type `deployStatus` banners persist until manually dismissed via a ✕ button, matching the existing `persistenceError` banner pattern ([page.tsx:602-607](app/(app)/dashboard/page.tsx#L602-L607)).

### D. Accumulate pending files across a pass
In [page.tsx:417](app/(app)/dashboard/page.tsx#L417), change `setPendingFiles(files)` to merge by path instead of replace:

```ts
setPendingFiles(prev => {
  const merged = new Map(prev.map(f => [f.path, f]))
  for (const f of files) merged.set(f.path, f)
  return Array.from(merged.values())
})
```

Latest content per path wins (same dedup convention as `writeRepoFilesSingleCommit` and the reload-recovery `latestFileByPath`). `pendingFiles` is already cleared on successful push ([page.tsx:506](app/(app)/dashboard/page.tsx#L506)), so accumulation correctly resets per push. The "N files ready to push" banner now reflects the running total across the whole pass — one commit covers everything generated so far, not just the last module.

## Testing Plan

1. `npm run build` passes.
2. Run M5 (Page Factory) → both zipper files complete without truncation, both appear in "ready to push".
3. Run M4 then M5 in the same session → "ready to push" shows files from both runs combined; pushing creates one commit containing all of them.
4. Visit Settings → "GitHub Connections" card shows ✓ for each site with a correctly configured token, and the real Octokit error for any misconfigured site (e.g. a renamed/missing repo).
5. Trigger a push failure (e.g. temporarily invalid token) → error banner stays visible until dismissed; a successful push still auto-clears.
