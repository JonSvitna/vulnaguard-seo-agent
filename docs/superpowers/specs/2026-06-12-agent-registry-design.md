# Agent Registry — Design

## Context

This is sub-project #1 of a broader "AI-OS" direction for the Vulnaguard SEO Agent app. The long-term goal is to evolve the existing collection of bespoke AI agents (SEO research/audit chat, Content Pipeline, and Marketing Agents: Qualifier, Copywriter, Scout) into something with OS-like primitives: a common agent interface, a unified job/run log, cross-agent orchestration, and a unified dashboard.

This sub-project covers only the **Agent Registry** — a common catalog and generic dispatch mechanism for the structured, single-shot agents. It is purely additive: no existing routes or agent logic change.

## Scope

**In scope (v1):**
- `lib/agents/registry.ts` — a catalog of agent definitions
- `app/api/agents/[name]/run/route.ts` — a generic POST route that dispatches to any registered agent by name

**Out of scope (future sub-projects):**
- The SEO chat agent (`app/api/agent/route.ts`) — free-form streaming conversation, doesn't fit the single-shot input/output shape
- Refactoring existing routes (`run-ai`, `scout/import`, `content-pipeline/*`) to call through the registry
- Persisting/logging registry runs (this is sub-project #2, Unified Job Log)
- Orchestration / agent-triggers-agent (sub-project #3)
- Unified dashboard (sub-project #4)

## Architecture

### `lib/agents/registry.ts`

Exports a catalog object, keyed by agent name:

```ts
export interface AgentDefinition<TInput, TOutput> {
  name: string;
  description: string;
  run: (input: TInput) => Promise<TOutput>;
}

export const AGENT_REGISTRY: Record<string, AgentDefinition<unknown, unknown>> = {
  qualifier: { ... },
  copywriter: { ... },
  scout: { ... },
  "content-pipeline": { ... },
};

export function getAgent(name: string): AgentDefinition<unknown, unknown> | undefined {
  return AGENT_REGISTRY[name];
}
```

Each entry's `run` function is a thin wrapper around the existing exported agent function — no changes to agent internals.

### The 4 agents in v1

| Registry name | Wraps | Input | Output |
| --- | --- | --- | --- |
| `qualifier` | `qualifyLead` from `agents/outreach` | `OutreachLead` | `QualifierResult` |
| `copywriter` | `draftSequence` from `agents/outreach` | `OutreachLead` | `CopywriterResult` |
| `scout` | `extractLeads` from `agents/scout` | `{ rawText: string }` | `ExtractedLead[]` |
| `content-pipeline` | `runContentPipelineAgent` from `agents/content-pipeline` | `ContentPipelineInput` | `GeneratedContent` |

### `app/api/agents/[name]/run/route.ts`

```ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const agent = getAgent(name);
  if (!agent) return NextResponse.json({ error: `Unknown agent: ${name}` }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (body === null) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

  try {
    const result = await agent.run(body);
    return NextResponse.json({ result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Agent execution failed" },
      { status: 500 }
    );
  }
}
```

Input validation is intentionally minimal for v1: each agent's existing `run` function already throws on missing/invalid fields (e.g. `extractLeads` throws on empty input, `runContentPipelineAgent` throws if `rawInput` is missing). The route's job is just to catch those errors and return them as `500` with the message — no new schema validation library is introduced.

### Existing routes are unchanged

`run-ai`, `scout/import`, and `content-pipeline/*` continue calling the underlying agent functions (`qualifyLead`, `extractLeads`, etc.) directly, because they have request-specific logic — DB lookups, status transitions, persistence — beyond "run the agent and return the result." The registry and generic route are an *additive* uniform entry point for future sub-projects (#2 Job Log, #3 Orchestration) to call into, not a replacement for the working bespoke routes.

## Error Handling

- Unknown agent name → `404 { error: "Unknown agent: <name>" }`
- Invalid/missing JSON body → `400 { error: "Invalid JSON body" }`
- Agent's `run` throws (validation error or Anthropic API error) → `500 { error: <message> }`

This matches the error-handling conventions already used across `app/api/marketing/*` routes.

## Testing Plan

Manual verification against local dev (`npm run dev`) with `curl`:

1. `POST /api/agents/scout/run` with `{"rawText": "<sample org listing text>"}` → expect `{ result: ExtractedLead[] }`
2. `POST /api/agents/qualifier/run` with a sample `OutreachLead` object → expect `{ result: { score, score_reason } }`
3. `POST /api/agents/copywriter/run` with a sample `OutreachLead` → expect `{ result: { emails, linkedin_message } }`
4. `POST /api/agents/content-pipeline/run` with a sample `ContentPipelineInput` → expect `{ result: GeneratedContent }`
5. `POST /api/agents/nonexistent/run` → expect `404`
6. `POST /api/agents/scout/run` with invalid body (missing `rawText`) → expect `500` with the underlying validation message

`npm run build` must pass (TypeScript strictness across the new catalog and route).
