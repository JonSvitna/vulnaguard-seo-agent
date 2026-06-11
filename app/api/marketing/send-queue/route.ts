import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface QueueRow extends Record<string, unknown> {
  id: number;
  sequence_id: number;
  lead_id: number;
  touch_number: number;
  subject: string | null;
  body: string | null;
  scheduled_at: string | null;
  company_name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_linkedin: string | null;
  linkedin_message: string | null;
}

export async function GET() {
  try {
    const rows = await query<QueueRow>(
      `SELECT e.id, e.sequence_id, e.lead_id, e.touch_number, e.subject, e.body, e.scheduled_at,
              l.company_name, l.contact_name, l.contact_email, l.contact_linkedin,
              lm.message AS linkedin_message
       FROM emails e
       JOIN sequences s ON s.id = e.sequence_id
       JOIN leads l ON l.id = e.lead_id
       LEFT JOIN linkedin_messages lm ON lm.sequence_id = e.sequence_id AND e.touch_number = 1
       WHERE e.status = 'drafted' AND s.status = 'approved'
       ORDER BY e.scheduled_at ASC NULLS LAST`
    );

    const due = rows.filter((r) => r.scheduled_at && new Date(r.scheduled_at) <= new Date());
    const upcoming = rows.filter((r) => !r.scheduled_at || new Date(r.scheduled_at) > new Date());

    return NextResponse.json({ due, upcoming });
  } catch (err) {
    console.error("[marketing/send-queue]", err);
    return NextResponse.json({ error: "Failed to load send queue" }, { status: 500 });
  }
}
