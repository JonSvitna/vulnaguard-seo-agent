# Full SEO Pass — Phase Approval Case Mismatch — Design

## Context

The "Full SEO Pass" runs the SEO agent through modules M1-M6 (research → monitor → audit → execute → factory → images) on the main `/dashboard` page. After each module, the system prompt (`lib/config.ts`) instructs the model to emit a phase-readiness marker on its own line, e.g.:

```
<!-- PHASE:research:READY -->
```

The dashboard parses this marker and, when ready, should show a green "Approve & Continue" banner that advances to the next module. **In practice, this banner never appears**, so the Full SEO Pass cannot auto-advance past M1 — the user has to manually click into each module.

## Root Cause

A case mismatch between the marker emitted by the LLM and the consumers of `phaseState.status`:

- The system prompt emits the status as **uppercase** `READY`.
- `extractPhaseMarker()` in `app/(app)/dashboard/page.tsx` extracts this verbatim via regex, so `phaseState.status` becomes `"READY"`.
- The approval banner condition checks `phaseState.status === 'ready'` (**lowercase**) — never matches, so the banner never renders.
- The same uppercase `"READY"` is POSTed to `/api/sessions/[id]/phase`, whose validation whitelist is `['pending', 'ready', 'approved', 'executing']` (**lowercase only**) — the request is rejected with `400 { error: 'invalid status' }`, which surfaces to the user as a phase-persistence error.

Both the missing banner and the persistence error trace back to this single mismatch. `getNextModuleAfterPhase()` (the M1→M2→...→M6 mapping) is correct and unaffected.

## Fix

Normalize the parsed marker to lowercase at the single point where it's extracted, in `extractPhaseMarker()`:

```ts
function extractPhaseMarker(text: string): { phase: string; status: string } | null {
  const match = text.match(/<!-- PHASE:(\w+):(\w+) -->/)
  return match ? { phase: match[1].toLowerCase(), status: match[2].toLowerCase() } : null
}
```

This single change fixes both downstream consumers without touching `lib/config.ts`'s system prompt or `phase/route.ts`'s validation:

- `phaseState.status` becomes `"ready"`, so the approval banner's `=== 'ready'` check matches and renders.
- The POST body to `/api/sessions/[id]/phase` sends `status: "ready"`, which passes validation and persists correctly.
- Session restore (`detail.session.phase_status` from the DB) is unaffected by this change — going forward, the DB will only ever contain lowercase values written via the fixed path, so restore stays consistent without separate changes.

Lowercasing `phase` as well as `status` is defensive (matches the lowercase `'research'|'monitor'|...` union and `PHASE_DEPS`/`MODULE_PHASES` keys), though the model has not been observed to vary phase-name casing.

## Out of Scope

- `PHASE_DEPS` in `app/api/sessions/[id]/phase/route.ts` is currently a no-op (the dependency check block computes `current` but never uses it to enforce ordering). This doesn't cause errors — phases can still only be reached in order via the UI's `getNextModuleAfterPhase` flow — but it means the API itself doesn't enforce phase ordering. Not part of this fix; flagged for a future cleanup if phase-ordering enforcement at the API level becomes necessary.

## Testing Plan

1. `npm run build` passes.
2. Run M1 (Research) for a site → response ends with `<!-- PHASE:research:READY -->` → green "RESEARCH phase ready for approval" banner appears (previously did not).
3. No `persistenceError` is shown; `GET /api/sessions/[id]/phase` reflects `phase_status = 'ready'`.
4. Click "✓ Approve & Continue" → advances to M2 (Ranking Monitor) via `getNextModuleAfterPhase`.
5. Repeat through M3-M6 to confirm the full chain (research → monitor → audit → factory/execute → images) progresses correctly.
6. Reload the page and re-select the session → phase banner state restores correctly from the DB.
