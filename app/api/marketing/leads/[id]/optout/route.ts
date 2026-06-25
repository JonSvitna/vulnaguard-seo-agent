import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { postSlackMessage } from "@/lib/slack";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const subject: string = body.subject ?? "";
    const ackBody: string = body.body ?? "";

    if (!subject.trim() || !ackBody.trim()) {
      return NextResponse.json({ error: "subject and body are required" }, { status: 400 });
    }

    const leads = await query<{ id: number; company_name: string; contact_name: string | null; contact_email: string | null }>(
      `SELECT id, company_name, contact_name, contact_email FROM leads WHERE id = $1`,
      [id]
    );
    if (!leads.length) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }
    const lead = leads[0];
    if (!lead.contact_email) {
      return NextResponse.json({ error: "Lead has no contact email" }, { status: 400 });
    }

    const sent = await sendEmail({ to: lead.contact_email, subject, body: ackBody });
    if (!sent.ok) {
      return NextResponse.json({ error: sent.error ?? "Failed to send ack email" }, { status: 502 });
    }

    await query(`UPDATE leads SET status = 'unsubscribed', updated_at = NOW() WHERE id = $1`, [id]);

    await postSlackMessage(
      `:no_entry_sign: *Opt-out processed* — ${lead.contact_name ?? "Contact"} at *${lead.company_name}* replied and was removed from outreach. Ack sent to ${lead.contact_email}.`
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[marketing/leads/[id]/optout POST]", err);
    return NextResponse.json({ error: "Failed to process opt-out" }, { status: 500 });
  }
}
