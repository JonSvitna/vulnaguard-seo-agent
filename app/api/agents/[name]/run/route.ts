import { NextRequest, NextResponse } from "next/server";
import { getAgent } from "@/lib/agents/registry";
import { runAgent } from "@/lib/agents/runAgent";

export async function POST(req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!getAgent(name)) {
    return NextResponse.json({ error: `Unknown agent: ${name}` }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  if (body === null) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const result = await runAgent(name, body);
    return NextResponse.json({ result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Agent execution failed" },
      { status: 500 },
    );
  }
}
