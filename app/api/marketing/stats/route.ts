import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES = ["discovered", "qualified", "disqualified", "drafted", "approved", "sent", "replied"];

export async function GET() {
  try {
    const counts = await query<{ status: string; count: string }>(
      `SELECT status, COUNT(*) as count FROM leads GROUP BY status`
    );

    const stats: Record<string, number> = {};
    for (const s of STATUSES) stats[s] = 0;
    let total = 0;
    for (const row of counts) {
      const n = parseInt(row.count, 10);
      if (STATUSES.includes(row.status)) stats[row.status] = n;
      total += n;
    }

    const recent_runs = await query(
      `SELECT id, agent, status, leads_processed, started_at, finished_at
       FROM pipeline_runs ORDER BY started_at DESC LIMIT 10`
    );

    return NextResponse.json({ ...stats, total, recent_runs });
  } catch (err) {
    console.error("[marketing/stats]", err);
    return NextResponse.json({ error: "Failed to load stats" }, { status: 500 });
  }
}
