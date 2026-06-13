# Unified Dashboard — Design

## Context

This is sub-project #4 of the AI-OS direction (see `2026-06-12-agent-registry-design.md` for the registry, `2026-06-12-agent-job-log-design.md` for the `agent_runs` job log, `2026-06-12-agent-orchestration-design.md` for the Scout→Qualifier auto-chain). With orchestration now generating real `agent_runs` traffic (every Scout import auto-qualifies leads via `runAgent("qualifier", ...)`), this sub-project adds a UI to view that log — the "process list" for the registry.

## Scope

**In scope (v1):**
- New route `app/(app)/dashboard/activity/page.tsx` — a read-only job log viewer
- New sidebar entry "Activity" in `app/(app)/_components/Sidebar.tsx`
- Filters for agent name and status, via URL search params
- Expandable rows showing raw `input`/`output`/`error` JSON

**Out of scope:**
- Manually triggering agents from the UI (stays a future enhancement)
- Pagination beyond the most recent 50 runs
- Live/polling updates — server-rendered, refresh on navigation
- Per-agent custom result summaries (e.g. showing a lead's score inline) — raw JSON only for v1

## Architecture

### Sidebar (`app/(app)/_components/Sidebar.tsx`)

Add an entry to `NAV`, between "Content" and "Settings":

```ts
const NAV = [
  { href: "/dashboard", icon: "⬡", label: "Agent" },
  { href: "/dashboard/marketing-agents", icon: "📣", label: "Marketing" },
  { href: "/content-pipeline", icon: "✦", label: "Content" },
  { href: "/dashboard/activity", icon: "🕓", label: "Activity" },
  { href: "/settings", icon: "⚙", label: "Settings" },
];
```

No other changes to `Sidebar.tsx` — the existing active-state logic (`pathname === href || pathname.startsWith(href + "/")`) works unchanged for `/dashboard/activity`.

### `AgentRun` type

Added alongside other row types in `lib/db.ts`:

```ts
export interface AgentRun {
  id: number;
  agent_name: string;
  status: "success" | "error";
  input: unknown;
  output: unknown;
  error: string | null;
  started_at: string;
  finished_at: string | null;
}
```

### Page (`app/(app)/dashboard/activity/page.tsx`)

A server component. Reads `searchParams` (`agent?: string`, `status?: string`), both optional and validated against known values (fall back to "all" / undefined if invalid).

```ts
const rows = await query<AgentRun>(
  `SELECT * FROM agent_runs
   WHERE ($1::text IS NULL OR agent_name = $1)
     AND ($2::text IS NULL OR status = $2)
   ORDER BY started_at DESC
   LIMIT 50`,
  [agentFilter ?? null, statusFilter ?? null]
);
```

Renders:
- A page header ("Activity" title)
- `<ActivityFilters currentAgent={...} currentStatus={...} />`
- A list of `<details>` rows (one per `AgentRun`), or an empty state if `rows.length === 0`

### Filters (`app/(app)/dashboard/activity/_components/ActivityFilters.tsx`)

`"use client"` component. Two `<select>` elements:

- **Agent**: "All" + each key from `AGENT_REGISTRY` (`qualifier`, `copywriter`, `scout`, `content-pipeline`)
- **Status**: "All" / "success" / "error"

On change, builds a new query string and calls `useRouter().push('/dashboard/activity?...')`, triggering a server re-render of the page via existing client-side routing (no full page reload, per the sidebar-navigation work).

### Row rendering

Each `AgentRun` renders as a native `<details>` element — expand/collapse works with zero client JS:

```html
<details class="border border-white/[0.07] rounded-md mb-2 bg-white/[0.02]">
  <summary class="flex items-center gap-4 px-4 py-3 cursor-pointer text-sm">
    <span class="...badge...">{agent_name}</span>
    <span class="...pill, green if success / red if error...">{status}</span>
    <span class="text-gray-400">{formatted started_at}</span>
    <span class="text-gray-400">{duration}</span>
  </summary>
  <div class="px-4 pb-4 space-y-3">
    <!-- input, output, error as <pre> JSON blocks -->
  </div>
</details>
```

- **Duration**: `finished_at - started_at` in ms; format as `"123ms"` if < 1000, else `"X.Xs"`. If `finished_at` is null, show `"—"`.
- **Timestamps**: formatted with `toLocaleString()` (consistent with existing pages).
- **JSON blocks**: `<pre>` with `JSON.stringify(value, null, 2)`, styled `bg-[#0D0F14] border border-white/[0.07] rounded p-3 text-xs overflow-x-auto`. Skip rendering a block if the value is `null`/`undefined`.

### Empty state

If `rows.length === 0`: a centered message — "No agent runs yet — they'll appear here once agents start running." (or "No runs match these filters." if filters are active).

## Error Handling

- Invalid `agent`/`status` query params (not matching known values) are treated as "All" rather than erroring.
- DB query failure: let it propagate as a normal server component error (consistent with other dashboard pages — no special handling).

## Testing Plan

1. `npm run build` passes (new route, new type, no TS errors).
2. Visit `/dashboard/activity` — shows recent `agent_runs` rows, most recent first, including qualifier runs from earlier Scout import testing.
3. Filter by agent = "qualifier" → only qualifier rows shown; URL reflects `?agent=qualifier`.
4. Filter by status = "error" → only error rows (or empty state if none exist).
5. Combine both filters → intersection.
6. Click a row's summary → expands to show `input`/`output`/`error` as formatted JSON.
7. Sidebar shows "Activity" between "Content" and "Settings", with correct active-state highlight on `/dashboard/activity`.
8. Navigating to/from Activity uses client-side routing (no full page reload), consistent with the rest of the app.
