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
