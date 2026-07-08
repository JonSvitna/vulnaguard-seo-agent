import { NextResponse } from "next/server";
import { query } from "@/lib/db";

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

interface SentRow extends Record<string, unknown> {
  id: number;
  touch_number: number;
  subject: string | null;
  sent_at: string;
  company_name: string;
  contact_email: string | null;
}

export async function GET() {
  try {
    // Self-healing cleanup: a lead with no email address can never clear the
    // email send queue (batch send skips it, and it sits there touch after
    // touch for the life of the sequence). Demote it out of the active
    // pipeline instead of letting it clog Due/Upcoming with nothing actionable.
    await query(
      `UPDATE leads SET status = 'no_email', updated_at = NOW()
       WHERE contact_email IS NULL
         AND status NOT IN ('unsubscribed', 'no_email')
         AND id IN (SELECT DISTINCT lead_id FROM emails WHERE status = 'drafted')`
    );
    await query(
      `UPDATE emails SET status = 'cancelled'
       WHERE status = 'drafted'
         AND lead_id IN (SELECT id FROM leads WHERE contact_email IS NULL)`
    );

    const rows = await query<QueueRow>(
      `SELECT e.id, e.sequence_id, e.lead_id, e.touch_number, e.subject, e.body, e.scheduled_at,
              l.company_name, l.contact_name, l.contact_email, l.contact_linkedin,
              lm.message AS linkedin_message
       FROM emails e
       JOIN sequences s ON s.id = e.sequence_id
       JOIN leads l ON l.id = e.lead_id
       LEFT JOIN linkedin_messages lm ON lm.sequence_id = e.sequence_id AND e.touch_number = 1
       WHERE e.status = 'drafted' AND s.status = 'approved' AND l.contact_email IS NOT NULL
       ORDER BY e.scheduled_at ASC NULLS LAST`
    );

    const due = rows.filter((r) => r.scheduled_at && new Date(r.scheduled_at) <= new Date());
    // Touch 1 with no scheduled_at means the sequence was approved but never
    // released — it's waiting on an explicit "release to send" click, not just
    // a future date, so it's surfaced separately from genuinely upcoming touches.
    const awaitingRelease = rows.filter((r) => r.touch_number === 1 && !r.scheduled_at);
    const upcoming = rows.filter((r) => r.scheduled_at && new Date(r.scheduled_at) > new Date());

    const limitRows = await query<{ value: string }>(
      `SELECT value FROM agent_config WHERE key = 'daily_send_limit'`
    );
    const dailyLimit = Number(limitRows[0]?.value) || 50;

    const sentTodayRows = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM emails WHERE sent_at >= CURRENT_DATE`
    );
    const sentToday = Number(sentTodayRows[0]?.count) || 0;

    const recentSent = await query<SentRow>(
      `SELECT e.id, e.touch_number, e.subject, e.sent_at, l.company_name, l.contact_email
       FROM emails e
       JOIN leads l ON l.id = e.lead_id
       WHERE e.status = 'sent'
       ORDER BY e.sent_at DESC
       LIMIT 25`
    );

    return NextResponse.json({ due, awaitingRelease, upcoming, dailyLimit, sentToday, recentSent });
  } catch (err) {
    console.error("[marketing/send-queue]", err);
    return NextResponse.json({ error: "Failed to load send queue" }, { status: 500 });
  }
}
