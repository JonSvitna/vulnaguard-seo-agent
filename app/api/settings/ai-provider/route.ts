import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { ensureSchema } from "@/lib/db";

export async function GET() {
  try {
    await ensureSchema();
    const rows = await query<{ agent_name: string; provider: string; model: string }>(
      `SELECT agent_name, provider, model FROM ai_provider_config ORDER BY agent_name = 'default' DESC, agent_name ASC`
    );
    return NextResponse.json({ configs: rows });
  } catch (err) {
    console.error("[settings/ai-provider GET]", err);
    return NextResponse.json({ error: "Failed to load AI provider config" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureSchema();
    const { agent_name, provider, model } = await req.json();

    if (!agent_name || !provider || !model) {
      return NextResponse.json({ error: "agent_name, provider, and model are required" }, { status: 400 });
    }
    if (!['openai', 'claude'].includes(provider)) {
      return NextResponse.json({ error: "provider must be 'openai' or 'claude'" }, { status: 400 });
    }

    await query(
      `INSERT INTO ai_provider_config (agent_name, provider, model, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (agent_name) DO UPDATE SET provider = $2, model = $3, updated_at = NOW()`,
      [agent_name, provider, model]
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[settings/ai-provider POST]", err);
    return NextResponse.json({ error: "Failed to update AI provider config" }, { status: 500 });
  }
}
