# Per-Lead AI History — Design

## Context

The Marketing Agents leads table tracks each lead's current `status` and `score`, but gives no visibility into *when* AI actions ran on a lead or what they produced. The `agent_runs` log (added in the AI-OS Job Log sub-project, now surfaced globally in `/dashboard/activity`) already records every qualifier and copywriter run with the full lead object as `input` — this sub-project surfaces that history per-lead, directly in the leads table.

## Scope

**In scope (v1):**
- `app/api/marketing/leads/[id]/history/route.ts` — `GET` returns qualifier/copywriter `agent_runs` for a given lead, newest first
- `LeadHistoryModal` component in `marketing-agents/page.tsx` — friendly, per-agent-type summaries with timestamps
- "History" button in the leads table Actions column

**Out of scope:**
- Broader activity timeline (manual status changes, "Mark Sent", lead edits) — this covers AI agent runs only
- Scout runs — `extractLeads` operates on raw text batches, not a single lead, so it has no `input->>'id'` to match
- Pagination — a lead's AI run count is expected to be small (a handful of qualify/draft attempts)

## Architecture

### `app/api/marketing/leads/[id]/history/route.ts`

```ts
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

interface AgentRun {
  id: number;
  agent_name: string;
  status: "success" | "error";
  input: unknown;
  output: unknown;
  error: string | null;
  started_at: string;
  finished_at: string | null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const runs = await query<AgentRun>(
    `SELECT * FROM agent_runs
     WHERE (input->>'id')::int = $1
       AND agent_name IN ('qualifier', 'copywriter')
     ORDER BY started_at DESC`,
    [id]
  );

  return NextResponse.json({ runs });
}
```

`(input->>'id')::int = $1` matches because `qualifyLead`/`draftSequence` are invoked via `runAgent(name, lead)`, and `runAgent` logs that `lead` object (including its `id`) as `agent_runs.input`.

### `LeadHistoryModal` (new component in `marketing-agents/page.tsx`)

Follows the existing `SequenceEditorModal` pattern: `"use client"`, fetches on mount via `useEffect`, uses the shared `Modal` wrapper.

```ts
function LeadHistoryModal({ leadId, companyName, onClose }: { leadId: number; companyName: string; onClose: () => void }) {
  const [runs, setRuns] = useState<AgentRun[] | null>(null);

  useEffect(() => {
    fetch(`/api/marketing/leads/${leadId}/history`)
      .then(res => res.json())
      .then(data => setRuns(data.runs));
  }, [leadId]);

  return (
    <Modal title={`History — ${companyName}`} onClose={onClose} width={480}>
      {runs === null ? (
        <div>Loading...</div>
      ) : runs.length === 0 ? (
        <div>No AI activity yet for this lead.</div>
      ) : (
        runs.map(run => (
          <div key={run.id}>
            <div>{describeRun(run)}</div>
            <div style={{ fontSize: 11, color: "#666" }}>{new Date(run.started_at).toLocaleString()}</div>
          </div>
        ))
      )}
    </Modal>
  );
}
```

### `describeRun(run: AgentRun): string`

Per-agent, per-status formatting:

| `agent_name` | `status` | Summary |
| --- | --- | --- |
| `qualifier` | `success` | `Qualified — score {output.score}/10: {output.score_reason}` |
| `qualifier` | `error` | `Qualification failed: {error}` |
| `copywriter` | `success` | `Sequence drafted — {output.emails.length} emails + LinkedIn message` |
| `copywriter` | `error` | `Draft failed: {error}` |

### Leads table change

Add a "History" button to the Actions column (alongside Edit/Sequence/Delete), styled consistently (e.g. `#4C8EC9` border/text to match the agent badge color used elsewhere). Clicking it sets a `historyModal` state `{ leadId, companyName }`, rendering `<LeadHistoryModal />` when non-null — same pattern as `sequenceModal`/`leadModal`.

## Error Handling

- If the fetch to `/history` fails, show "Failed to load history." in the modal (no retry logic needed for v1).
- The route itself has no special error handling beyond the existing `query()` behavior — a DB error propagates as a 500, consistent with other routes.

## Testing Plan

1. `npm run build` passes.
2. Click "History" on a lead that was auto-qualified during a Scout import → modal shows "Qualified — score X/10: ..." with the correct timestamp.
3. Click "Run AI" on a `discovered` lead, then re-open History → new qualifier entry appears (newest first).
4. Click "Draft Sequence (AI)" on a `qualified` lead, then re-open History → new copywriter entry appears above the qualifier entry.
5. A lead with no AI runs yet → "No AI activity yet for this lead."
6. If any qualifier/copywriter run for a lead errored (cross-check against `/dashboard/activity`), that lead's History shows the failure message.
