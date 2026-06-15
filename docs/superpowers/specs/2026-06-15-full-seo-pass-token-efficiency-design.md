# Design: Full SEO Pass Token Efficiency

**Date:** 2026-06-15
**Status:** Approved

---

## Context

`/api/agent` powers the Full SEO Pass (M1→M6) on `/dashboard`. Each turn sends the entire `SEO_SYSTEM_PROMPT` (~512 tokens, uncached) plus the full conversation history (`conversationRef.current`) as input. M4/M5/M6 responses include complete generated file contents (Next.js page code, schema, etc.) — by M6, every prior module's full file output is being re-sent as input, even though the model already produced it and it's no longer needed verbatim except by the immediately-following module.

A token/cost survey across the app's Claude call sites found:
- All other system prompts (scout, outreach, content-pipeline — 203-810 tokens) are below Anthropic's 1024-token minimum for `cache_control` to have any effect on Sonnet/Opus, and these are single-shot calls with no growing history. **No caching win is available there**, so this design is scoped to `/api/agent` only.
- `/api/agent`'s system prompt alone (~512 tokens) is also below the minimum, but `system + conversation history` crosses 1024 tokens from turn 2 onward in any real Full SEO Pass — that's where this design targets savings.

## Solution

Two independent, additive mechanisms, both confined to `app/(app)/dashboard/page.tsx` and `app/api/agent/route.ts`.

### A. Trim stale file blocks from the API-context copy

`conversationRef.current` (sent to `/api/agent`) is optimized for API context size. `messages` (React UI state) and DB-persisted session messages (`persistMessage`) remain **full-fidelity and untouched** — reopening a session always shows complete generated files.

**New helper** `trimFileBlocks(content: string): string`:
- Uses the same fence-matching regex as `parseFileBlocks()` to find every ` ```file:path\n...\n``` ` block.
- Replaces each with a one-line placeholder, e.g. `` `[file: app/blog/foo/page.tsx — ~340 words, generated above]` `` (word count derived from the block content before replacing).
- Leaves surrounding prose (module report/recommendations) untouched.

**Application point** — in `streamAgent`, right before appending the new assistant response to `conversationRef.current`:
- If the current last message in `conversationRef.current` is an assistant message containing file blocks, replace it in place with `trimFileBlocks(...)`.
- Then append the new (untrimmed) assistant message.

**Net effect**: at most one assistant message in `conversationRef.current` (the most recent) retains full file content at any time. M6 can still see M5's full blog post to compute image count; once M6's response is appended, M5's files collapse to placeholders.

### B. Cache the stable conversation prefix

In `app/api/agent/route.ts` (Anthropic branch), mark `cache_control: { type: 'ephemeral' }` on the **second-to-last element** of the incoming `messages` array (the last message before the newest user message), when one exists. This is Anthropic's standard incremental-caching pattern for multi-turn chat — the cached prefix covers `system` + everything through that message.

- **Turn 1**: no prior messages → no breakpoint added (nothing to cache; system alone is under the 1024-token minimum anyway).
- **Turn 2+**: breakpoint lands on the previous assistant turn. `system + history-so-far` exceeds ~1024 tokens from turn 2 onward in practice, so this becomes a real cache write.

**Interaction with trimming (set expectations honestly)**: Trimming (A) mutates one message per turn (the previously-"hot" assistant turn gets demoted to a placeholder), so a turn-N cache write isn't guaranteed to be a byte-for-byte hit at turn N+1. Only one message near the end of the array changes, so the unchanged earlier portion should still be creditable via prefix matching — but this is not guaranteed and will be measured, not assumed.

Critically, **(A) alone already reduces raw input tokens sent every turn** regardless of cache hit rate — that's the primary, guaranteed win. (B) is additive on top whenever it lands.

## Testing Plan

1. `npm run build` passes.
2. Run a full M1→M6 pass. Confirm `messages` (UI) and session history (on reload) still show complete file contents for every module — trimming must not affect what the user sees or what's persisted.
3. Confirm M6 still correctly determines image count from M5's post (validates "latest turn stays untrimmed" holds across the M5→M6 boundary).
4. Temporarily log `usage.cache_read_input_tokens`, `usage.cache_creation_input_tokens`, and `usage.input_tokens` per turn in `route.ts`. Confirm:
   - Turn 3+ input token counts are meaningfully lower than a pre-change baseline run (proves trimming works).
   - `cache_read_input_tokens` is non-zero on at least some turns (proves caching activates).
5. Remove temporary logging, or downgrade to a minimal one-line debug log if useful for ongoing cost visibility.

## Out of Scope

- Marketing agents (scout/outreach/content-pipeline) — no caching benefit available given current prompt sizes (203-810 tokens) and single-shot call pattern.
- Model tiering (Haiku for classification tasks) — separate concern, not addressed here.
- Output verbosity / prompt tuning to reduce output tokens — separate concern, not addressed here.
- Changes to `SEO_SYSTEM_PROMPT` content, `max_tokens`, or session/DB schema.
