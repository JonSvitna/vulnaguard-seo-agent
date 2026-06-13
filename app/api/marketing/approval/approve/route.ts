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

    const configRows = await query<{ value: string }>(
      `SELECT value FROM agent_config WHERE key = 'sequence_delay_days'`
    );
    const delays = (configRows[0]?.value ?? "4,9").split(",").map((d) => Number(d.trim()));
    const [delay2, delay3] = [
      Number.isFinite(delays[0]) ? delays[0] : 4,
      Number.isFinite(delays[1]) ? delays[1] : 9,
    ];

    await query(
      `UPDATE emails SET scheduled_at = NOW() WHERE sequence_id = ANY($1::int[]) AND touch_number = 1`,
      [ids]
    );
    await query(
      `UPDATE emails SET scheduled_at = NOW() + make_interval(days => $2) WHERE sequence_id = ANY($1::int[]) AND touch_number = 2`,
      [ids, delay2]
    );
    await query(
      `UPDATE emails SET scheduled_at = NOW() + make_interval(days => $2) WHERE sequence_id = ANY($1::int[]) AND touch_number = 3`,
      [ids, delay3]
    );

    return NextResponse.json({ ok: true, updated: ids.length });
  } catch (err) {
    console.error("[marketing/approval/approve]", err);
    return NextResponse.json({ error: "Failed to approve sequences" }, { status: 500 });
  }
}
