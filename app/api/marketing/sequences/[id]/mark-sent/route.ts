import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";


export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const sequences = await query<{ lead_id: number }>(
      `UPDATE sequences SET status = 'sent' WHERE id = $1 RETURNING lead_id`,
      [id]
    );
    if (!sequences.length) {
      return NextResponse.json({ error: "Sequence not found" }, { status: 404 });
    }

    await query(
      `UPDATE emails SET status = 'sent', sent_at = NOW() WHERE sequence_id = $1`,
      [id]
    );
    await query(
      `UPDATE leads SET status = 'sent', updated_at = NOW() WHERE id = $1`,
      [sequences[0].lead_id]
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[marketing/sequences/[id]/mark-sent]", err);
    return NextResponse.json({ error: "Failed to mark sequence as sent" }, { status: 500 });
  }
}
