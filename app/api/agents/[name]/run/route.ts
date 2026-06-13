import { NextRequest, NextResponse } from "next/server";
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
    console.error("[agents/run] failed to log agent_runs row", err);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const agent = getAgent(name);
  if (!agent) {
    return NextResponse.json({ error: `Unknown agent: ${name}` }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  if (body === null) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const startedAt = new Date();

  try {
    const result = await agent.run(body);
    await logRun(name, "success", body, startedAt, result);
    return NextResponse.json({ result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Agent execution failed";
    await logRun(name, "error", body, startedAt, undefined, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
