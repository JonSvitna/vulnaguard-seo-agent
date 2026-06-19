import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

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

interface PromptRun extends Record<string, unknown> {
  id: number;
  agent_name: string;
  provider: string;
  model: string;
  system_prompt: string | null;
  user_prompt: string | null;
  response: string | null;
  status: "success" | "error";
  error: string | null;
  duration_ms: number | null;
  started_at: string;
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

  const prompts = await query<PromptRun>(
    `SELECT id, agent_name, provider, model, system_prompt, user_prompt, response, status, error, duration_ms, started_at
     FROM prompt_runs
     WHERE lead_id = $1
     ORDER BY started_at DESC`,
    [id]
  );

  return NextResponse.json({ runs, prompts });
}
