"use client";

import { useRouter } from "next/navigation";

const STATUS_OPTIONS = ["success", "error"];

export function ActivityFilters({
  agentOptions,
  currentAgent,
  currentStatus,
}: {
  agentOptions: string[];
  currentAgent?: string;
  currentStatus?: string;
}) {
  const router = useRouter();

  function update(key: "agent" | "status", value: string) {
    const params = new URLSearchParams();
    const agent = key === "agent" ? value : currentAgent;
    const status = key === "status" ? value : currentStatus;
    if (agent) params.set("agent", agent);
    if (status) params.set("status", status);
    const query = params.toString();
    router.push(`/dashboard/activity${query ? `?${query}` : ""}`);
  }

  const selectClass =
    "bg-[#0D0F14] border border-white/[0.07] text-sm text-white rounded-md px-3 py-1.5";

  return (
    <div className="flex items-center gap-3 mb-4">
      <select
        className={selectClass}
        value={currentAgent ?? ""}
        onChange={(e) => update("agent", e.target.value)}
      >
        <option value="">All agents</option>
        {agentOptions.map((agent) => (
          <option key={agent} value={agent}>
            {agent}
          </option>
        ))}
      </select>

      <select
        className={selectClass}
        value={currentStatus ?? ""}
        onChange={(e) => update("status", e.target.value)}
      >
        <option value="">All statuses</option>
        {STATUS_OPTIONS.map((status) => (
          <option key={status} value={status}>
            {status}
          </option>
        ))}
      </select>
    </div>
  );
}
