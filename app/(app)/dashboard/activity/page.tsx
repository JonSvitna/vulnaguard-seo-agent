import { query } from "@/lib/db";
import { AGENT_REGISTRY } from "@/lib/agents/registry";
import { ActivityFilters } from "./_components/ActivityFilters";

interface AgentRun extends Record<string, unknown> {
  id: number;
  agent_name: string;
  status: "success" | "error";
  input: unknown;
  output: unknown;
  error: string | null;
  started_at: string;
  finished_at: string | null;
}

const VALID_STATUSES = ["success", "error"];

function formatDuration(startedAt: string, finishedAt: string | null): string {
  if (!finishedAt) return "—";
  const ms = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ agent?: string; status?: string }>;
}) {
  const params = await searchParams;
  const agentOptions = Object.keys(AGENT_REGISTRY);

  const agentFilter = agentOptions.includes(params.agent ?? "") ? params.agent! : undefined;
  const statusFilter = VALID_STATUSES.includes(params.status ?? "") ? params.status! : undefined;

  const rows = await query<AgentRun>(
    `SELECT * FROM agent_runs
     WHERE ($1::text IS NULL OR agent_name = $1)
       AND ($2::text IS NULL OR status = $2)
     ORDER BY started_at DESC
     LIMIT 50`,
    [agentFilter ?? null, statusFilter ?? null]
  );

  const hasFilters = Boolean(agentFilter || statusFilter);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-xl font-bold text-white mb-4">Activity</h1>

      <ActivityFilters
        agentOptions={agentOptions}
        currentAgent={agentFilter}
        currentStatus={statusFilter}
      />

      {rows.length === 0 ? (
        <div className="text-sm text-gray-400 py-10 text-center">
          {hasFilters
            ? "No runs match these filters."
            : "No agent runs yet — they'll appear here once agents start running."}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((run) => (
            <details
              key={run.id}
              className="border border-white/[0.07] rounded-md bg-white/[0.02]"
            >
              <summary className="flex items-center gap-4 px-4 py-3 cursor-pointer text-sm">
                <span
                  className="font-mono text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded"
                  style={{ background: "#4C8EC922", color: "#4C8EC9", border: "1px solid #4C8EC944" }}
                >
                  {run.agent_name}
                </span>
                <span
                  className="font-mono text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded"
                  style={
                    run.status === "success"
                      ? { background: "#4CC98E22", color: "#4CC98E", border: "1px solid #4CC98E44" }
                      : { background: "#C94C4C22", color: "#C94C4C", border: "1px solid #C94C4C44" }
                  }
                >
                  {run.status}
                </span>
                <span className="text-gray-400">{new Date(run.started_at).toLocaleString()}</span>
                <span className="text-gray-400">{formatDuration(run.started_at, run.finished_at)}</span>
              </summary>
              <div className="px-4 pb-4 space-y-3">
                {run.input != null && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">Input</div>
                    <pre className="bg-[#0D0F14] border border-white/[0.07] rounded p-3 text-xs overflow-x-auto text-gray-300">
                      {JSON.stringify(run.input, null, 2)}
                    </pre>
                  </div>
                )}
                {run.output != null && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">Output</div>
                    <pre className="bg-[#0D0F14] border border-white/[0.07] rounded p-3 text-xs overflow-x-auto text-gray-300">
                      {JSON.stringify(run.output, null, 2)}
                    </pre>
                  </div>
                )}
                {run.error != null && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">Error</div>
                    <pre className="bg-[#0D0F14] border border-white/[0.07] rounded p-3 text-xs overflow-x-auto text-[#C94C4C]">
                      {run.error}
                    </pre>
                  </div>
                )}
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
