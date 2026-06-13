import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";


const STATUS_ORDER = ["discovered", "qualified", "drafted", "approved", "sent", "replied"];

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const emails = Array.isArray(body.emails) ? body.emails : [];
    const linkedinMessage: string = body.linkedin_message ?? "";

    const leads = await query<{ id: number; status: string }>(
      `SELECT id, status FROM leads WHERE id = $1`,
      [id]
    );
    if (!leads.length) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    // Replace any existing sequence for this lead (cascades emails/linkedin_messages)
    await query(`DELETE FROM sequences WHERE lead_id = $1`, [id]);

    const sequences = await query<{ id: number }>(
      `INSERT INTO sequences (lead_id, status) VALUES ($1, 'drafted') RETURNING id`,
      [id]
    );
    const sequenceId = sequences[0].id;

    for (let i = 0; i < emails.length; i++) {
      const e = emails[i];
      await query(
        `INSERT INTO emails (sequence_id, lead_id, touch_number, subject, body, status)
         VALUES ($1, $2, $3, $4, $5, 'drafted')`,
        [sequenceId, id, e.touch_number ?? i + 1, e.subject ?? "", e.body ?? ""]
      );
    }

    if (linkedinMessage.trim()) {
      await query(
        `INSERT INTO linkedin_messages (sequence_id, lead_id, message, status)
         VALUES ($1, $2, $3, 'drafted')`,
        [sequenceId, id, linkedinMessage]
      );
    }

    // Advance lead status to 'drafted' if it isn't already further along
    const currentIdx = STATUS_ORDER.indexOf(leads[0].status);
    const draftedIdx = STATUS_ORDER.indexOf("drafted");
    if (currentIdx === -1 || currentIdx < draftedIdx) {
      await query(`UPDATE leads SET status = 'drafted', updated_at = NOW() WHERE id = $1`, [id]);
    }

    return NextResponse.json({ ok: true, sequence_id: sequenceId });
  } catch (err) {
    console.error("[marketing/leads/[id]/sequence PUT]", err);
    return NextResponse.json({ error: "Failed to save sequence" }, { status: 500 });
  }
}
