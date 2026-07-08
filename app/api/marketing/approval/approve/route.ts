import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

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

    // Approving only signs off on the drafted content. No email is scheduled here —
    // that's a separate, explicit action (POST /api/marketing/approval/release) so
    // clicking Approve can never be mistaken for "send it," and touch 2/3 delays are
    // computed from the actual release moment instead of drifting if release happens
    // long after approval.

    return NextResponse.json({ ok: true, updated: ids.length });
  } catch (err) {
    console.error("[marketing/approval/approve]", err);
    return NextResponse.json({ error: "Failed to approve sequences" }, { status: 500 });
  }
}
