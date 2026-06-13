import { getAgent } from "@/lib/agents/registry";
import { query } from "@/lib/db";

async function logRun(
  agentName: string,
  status: "success" | "error",
  input: unknown,
  startedAt: Date,
  output?: unknown,
  error?: string,
) {
  try {
    await query(
      `INSERT INTO agent_runs (agent_name, status, input, output, error, started_at, finished_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [agentName, status, JSON.stringify(input), output !== undefined ? JSON.stringify(output) : null, error ?? null, startedAt],
    );
  } catch (err) {
    console.error("[runAgent] failed to log agent_runs row", err);
  }
}

export async function runAgent(name: string, input: unknown): Promise<unknown> {
  const agent = getAgent(name);
  if (!agent) {
    throw new Error(`Unknown agent: ${name}`);
  }

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
