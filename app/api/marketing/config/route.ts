import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET() {
  try {
    const rows = await query<{ key: string; value: string }>(
      `SELECT key, value FROM agent_config`
    );
    const config: Record<string, string> = {};
    for (const row of rows) config[row.key] = row.value;
    return NextResponse.json({ config });
  } catch (err) {
    console.error("[marketing/config GET]", err);
    return NextResponse.json({ error: "Failed to load config" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const entries = Object.entries(body).filter(([, v]) => typeof v === "string");

    if (!entries.length) {
      return NextResponse.json({ error: "No config keys provided" }, { status: 400 });
    }

    for (const [key, value] of entries) {
      await query(
        `INSERT INTO agent_config (key, value, updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
        [key, value]
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[marketing/config POST]", err);
    return NextResponse.json({ error: "Failed to update config" }, { status: 500 });
  }
}
