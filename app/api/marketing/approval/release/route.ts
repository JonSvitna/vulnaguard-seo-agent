import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

// Explicit second step after /approval/approve. Approving signs off on the
// drafted content; releasing is the actual "yes, send touch 1 for real" action.
// Splitting these means clicking Approve can never accidentally fire a live
// send to a stranger — release requires its own deliberate click.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const ids: number[] = Array.isArray(body.sequence_ids) ? body.sequence_ids : [];

    if (!ids.length) {
      return NextResponse.json({ error: "sequence_ids is required" }, { status: 400 });
    }

    const sequences = await query<{ id: number; status: string }>(
      `SELECT id, status FROM sequences WHERE id = ANY($1::int[])`,
      [ids]
    );
    const notApproved = sequences.filter((s) => s.status !== "approved");
    if (notApproved.length) {
      return NextResponse.json(
        { error: `Sequence(s) not in 'approved' status, cannot release: ${notApproved.map((s) => s.id).join(", ")}` },
        { status: 409 }
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

    return NextResponse.json({ ok: true, released: ids.length });
  } catch (err) {
    console.error("[marketing/approval/release]", err);
    return NextResponse.json({ error: "Failed to release sequences" }, { status: 500 });
  }
}
