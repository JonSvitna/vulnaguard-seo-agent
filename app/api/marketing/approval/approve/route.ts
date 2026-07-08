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
    const delays = (configRows[0]?.value ?? "4,9,14")
      .split(",")
      .map((d) => Number(d.trim()))
      .filter(Number.isFinite);

    await query(
      `UPDATE emails SET scheduled_at = NOW() WHERE sequence_id = ANY($1::int[]) AND touch_number = 1`,
      [ids]
    );

    // Handles any touch count (3-touch cmmc/website_dev, 4-touch commercial_security,
    // or anything else) instead of hardcoding touch_number 2/3 — a sequence with a
    // 4th touch would otherwise leave it with scheduled_at = NULL and it would never send.
    const touchNumbers = await query<{ touch_number: number }>(
      `SELECT DISTINCT touch_number FROM emails WHERE sequence_id = ANY($1::int[]) AND touch_number > 1 ORDER BY touch_number`,
      [ids]
    );
    for (const { touch_number } of touchNumbers) {
      const delayDays = delays[touch_number - 2] ?? delays[delays.length - 1] ?? (touch_number - 1) * 5;
      await query(
        `UPDATE emails SET scheduled_at = NOW() + make_interval(days => $2) WHERE sequence_id = ANY($1::int[]) AND touch_number = $3`,
        [ids, delayDays, touch_number]
      );
    }

    return NextResponse.json({ ok: true, updated: ids.length });
  } catch (err) {
    console.error("[marketing/approval/approve]", err);
    return NextResponse.json({ error: "Failed to approve sequences" }, { status: 500 });
  }
}
