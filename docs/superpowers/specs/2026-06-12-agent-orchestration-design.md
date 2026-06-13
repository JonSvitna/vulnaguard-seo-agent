# Orchestration: Scout → Qualifier Auto-Chain — Design

## Context

This is sub-project #3 of the AI-OS direction (see `2026-06-12-agent-registry-design.md` for the registry, `2026-06-12-agent-job-log-design.md` for the job log). With a generic, logged agent dispatch in place, this sub-project adds the first "agent triggers agent" chain: when the Scout bulk-import inserts new leads, the Qualifier runs automatically on each one.

## Scope

**In scope (v1):**
- `lib/agents/runAgent.ts` — extracted, reusable "run + log" helper
- `lib/marketing/qualify.ts` — extracted `qualifyAndUpdateLead` helper, used by both `run-ai` and the new chain
- `app/api/marketing/scout/import/route.ts` — auto-qualifies each newly inserted lead in parallel
- `app/api/marketing/leads/[id]/run-ai/route.ts` — refactored to use `qualifyAndUpdateLead` (no behavior change)
- Dashboard toast update to show qualified/disqualified counts after import

**Out of scope (future):**
- Auto-drafting sequences (Copywriter) for newly-qualified leads — stays a manual "Draft Sequence (AI)" action, since drafted content should be reviewed before saving
- Scheduled/cron-triggered runs (no agent currently has a meaningful "run with no new input" mode)
- Sub-project #4 (Unified Dashboard / job log UI)

## Architecture

### `lib/agents/runAgent.ts`

Extracted from the current inline logic in `app/api/agents/[name]/run/route.ts`:

```ts
export async function runAgent(name: string, input: unknown): Promise<unknown> {
  const agent = getAgent(name);
  if (!agent) throw new Error(`Unknown agent: ${name}`);

  const startedAt = new Date();
  try {
    const result = await agent.run(input);
    await logRun(name, "success", input, startedAt, result);
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Agent execution failed";
    await logRun(name, "error", input, startedAt, undefined, message);
    throw err;
  }
}
```

`logRun` (the `agent_runs` insert with its own try/catch, as built in sub-project #2) moves here too. The HTTP route becomes:

```ts
export async function POST(req, { params }) {
  const { name } = await params;
  if (!getAgent(name)) return NextResponse.json({ error: `Unknown agent: ${name}` }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (body === null) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

  try {
    const result = await runAgent(name, body);
    return NextResponse.json({ result });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Agent execution failed" }, { status: 500 });
  }
}
```

Behavior is unchanged from sub-project #2 — this is a pure extraction so orchestration code can call `runAgent` in-process (no HTTP round-trip) while still getting `agent_runs` logging.

### `lib/marketing/qualify.ts`

```ts
export async function qualifyAndUpdateLead(lead: OutreachLead): Promise<OutreachLead> {
  const result = await runAgent("qualifier", lead) as QualifierResult;

  const configRows = await query<{ value: string }>(
    `SELECT value FROM agent_config WHERE key = 'qualifier_min_score'`
  );
  const threshold = Number(configRows[0]?.value);
  const minScore = Number.isFinite(threshold) ? threshold : 6;

  const newStatus = result.score >= minScore ? "qualified" : "disqualified";

  const rows = await query<OutreachLead>(
    `UPDATE leads SET score = $1, score_reason = $2, status = $3, updated_at = NOW()
     WHERE id = $4 RETURNING *`,
    [result.score, result.score_reason, newStatus, lead.id]
  );
  return rows[0];
}
```

This is the exact logic currently inline in `run-ai`'s `discovered` branch, lifted out unchanged.

### `app/api/marketing/leads/[id]/run-ai/route.ts`

The `discovered` branch becomes:

```ts
if (lead.status === "discovered") {
  lead = await qualifyAndUpdateLead(lead);
}
```

Everything else (the `qualified` → `draftSequence` branch) is unchanged. If `qualifyAndUpdateLead` throws, the existing top-level `catch` returns `500 { error: "AI run failed. Please try again." }` as before.

### `app/api/marketing/scout/import/route.ts`

After the existing per-lead insert loop builds the `inserted` array, qualify all newly-inserted leads in parallel:

```ts
const qualified = await Promise.all(
  inserted.map(async (lead) => {
    try {
      return await qualifyAndUpdateLead(lead);
    } catch (err) {
      console.error("[marketing/scout/import] qualify failed for lead", lead.id, err);
      return lead; // stays 'discovered', score 0
    }
  })
);

const qualifiedCount = qualified.filter((l) => l.status === "qualified").length;
const disqualifiedCount = qualified.filter((l) => l.status === "disqualified").length;
```

`pipeline_runs` logging (existing) gains `qualified`/`disqualified` counts in its `details` JSON. The response becomes:

```ts
return NextResponse.json({
  extracted: extracted.length,
  imported: inserted.length,
  skipped_duplicates: skipped,
  qualified: qualifiedCount,
  disqualified: disqualifiedCount,
  leads: qualified,
});
```

### Dashboard toast (`app/(app)/dashboard/marketing-agents/page.tsx`)

`runImport`'s success toast becomes:

```ts
showToast(
  `Imported ${data.imported} lead${data.imported === 1 ? "" : "s"} (${data.skipped_duplicates} duplicate${data.skipped_duplicates === 1 ? "" : "s"} skipped) — ${data.qualified} qualified, ${data.disqualified} disqualified`
);
```

## Error Handling

- If `runAgent("qualifier", lead)` throws for one lead during import (e.g. transient Anthropic error), that lead is left as returned from the insert (`status='discovered'`, `score=0`). The error is captured in `agent_runs` via `runAgent`'s logging. The import as a whole still returns `200` with accurate counts — that lead just isn't counted as qualified or disqualified.
- The user can later qualify that lead manually via the existing "Run AI" button (now backed by the same `qualifyAndUpdateLead`).

## Testing Plan

1. `npm run build` passes.
2. Bulk-import text containing 2-3 distinct org listings → newly-inserted leads have `status` of `qualified` or `disqualified` (not `discovered`) and a non-zero `score`/`score_reason`; toast shows the new counts.
3. `SELECT * FROM agent_runs WHERE agent_name = 'qualifier' ORDER BY id DESC` shows one row per imported lead.
4. Click "Run AI" on an existing `discovered` lead → still transitions to `qualified`/`disqualified` as before (refactor is behavior-preserving).
5. Click "Draft Sequence (AI)" on a `qualified` lead (including one auto-qualified via import) → still works unchanged.
