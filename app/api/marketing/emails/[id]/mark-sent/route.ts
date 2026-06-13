import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";


export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const emails = await query<{ sequence_id: number; lead_id: number }>(
      `UPDATE emails SET status = 'sent', sent_at = NOW() WHERE id = $1 RETURNING sequence_id, lead_id`,
      [id]
    );
    if (!emails.length) {
      return NextResponse.json({ error: "Email not found" }, { status: 404 });
    }
    const { sequence_id, lead_id } = emails[0];

    const remaining = await query(
      `SELECT id FROM emails WHERE sequence_id = $1 AND status = 'drafted'`,
      [sequence_id]
    );

    if (!remaining.length) {
      await query(`UPDATE sequences SET status = 'sent' WHERE id = $1`, [sequence_id]);
      await query(`UPDATE leads SET status = 'sent', updated_at = NOW() WHERE id = $1`, [lead_id]);
    }

    return NextResponse.json({ ok: true, sequence_completed: !remaining.length });
  } catch (err) {
    console.error("[marketing/emails/[id]/mark-sent]", err);
    return NextResponse.json({ error: "Failed to mark email as sent" }, { status: 500 });
  }
}
