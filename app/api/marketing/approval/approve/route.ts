import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const ids: number[] = Array.isArray(body.sequence_ids) ? body.sequence_ids : [];

    if (!ids.length) {
      return NextResponse.json({ error: "sequence_ids is required" }, { status: 400 });
    }

    const sequences = await query<{ lead_id: number }>(
      `UPDATE sequences SET status = 'approved', approved_at = NOW()
       WHERE id = ANY($1::int[]) RETURNING lead_id`,
      [ids]
    );

    const leadIds = sequences.map((s) => s.lead_id);
    if (leadIds.length) {
      await query(
        `UPDATE leads SET status = 'approved', updated_at = NOW() WHERE id = ANY($1::int[])`,
        [leadIds]
      );
    }

    return NextResponse.json({ ok: true, updated: ids.length });
  } catch (err) {
    console.error("[marketing/approval/approve]", err);
    return NextResponse.json({ error: "Failed to approve sequences" }, { status: 500 });
  }
}
