import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

interface TouchRow extends Record<string, unknown> {
  lead_id: number;
  company_name: string;
  contact_email: string | null;
  category: string;
  business_line: string;
  sequence_status: string;
  email_id: number;
  touch_number: number;
  subject: string | null;
  email_status: string;
  scheduled_at: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  bounced_at: string | null;
  bounce_reason: string | null;
}

interface Touch {
  email_id: number;
  touch_number: number;
  subject: string | null;
  email_status: string;
  scheduled_at: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  bounced_at: string | null;
  bounce_reason: string | null;
}

interface LeadOutreachStatus {
  lead_id: number;
  company_name: string;
  contact_email: string | null;
  category: string;
  business_line: string;
  sequence_status: string;
  touches: Touch[];
}

type TouchWithLead = Touch & { company_name: string; lead_id: number };

export async function GET(req: NextRequest) {
  try {
    const businessLine = req.nextUrl.searchParams.get("business_line");

    const params: string[] = [];
    let businessLineClause = "";
    if (businessLine) {
      params.push(businessLine);
      businessLineClause = `AND l.business_line = $${params.length}`;
    }

    const rows = await query<TouchRow>(
      `SELECT l.id AS lead_id, l.company_name, l.contact_email, l.category, l.business_line,
              s.status AS sequence_status,
              e.id AS email_id, e.touch_number, e.subject, e.status AS email_status,
              e.scheduled_at, e.sent_at, e.delivered_at, e.bounced_at, e.bounce_reason
       FROM emails e
       JOIN sequences s ON s.id = e.sequence_id
       JOIN leads l ON l.id = e.lead_id
       WHERE s.status IN ('approved', 'sent') ${businessLineClause}
       ORDER BY l.company_name ASC, e.touch_number ASC`,
      params
    );

    const byLead = new Map<number, LeadOutreachStatus>();

    for (const row of rows) {
      if (!byLead.has(row.lead_id)) {
        byLead.set(row.lead_id, {
          lead_id: row.lead_id,
          company_name: row.company_name,
          contact_email: row.contact_email,
          category: row.category,
          business_line: row.business_line,
          sequence_status: row.sequence_status,
          touches: [],
        });
      }
      byLead.get(row.lead_id)!.touches.push({
        email_id: row.email_id,
        touch_number: row.touch_number,
        subject: row.subject,
        email_status: row.email_status,
        scheduled_at: row.scheduled_at,
        sent_at: row.sent_at,
        delivered_at: row.delivered_at,
        bounced_at: row.bounced_at,
        bounce_reason: row.bounce_reason,
      });
    }

    const leadsOut = Array.from(byLead.values());

    const now = new Date();
    const in3Days = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    const withLead = (lead: LeadOutreachStatus, t: Touch): TouchWithLead => ({
      ...t,
      company_name: lead.company_name,
      lead_id: lead.lead_id,
    });

    const upcoming3Days: TouchWithLead[] = leadsOut
      .flatMap((lead) =>
        lead.touches
          .filter((t) => t.email_status === "drafted" && t.scheduled_at)
          .filter((t) => {
            const d = new Date(t.scheduled_at as string);
            return d >= now && d <= in3Days;
          })
          .map((t) => withLead(lead, t))
      )
      .sort((a, b) => new Date(a.scheduled_at as string).getTime() - new Date(b.scheduled_at as string).getTime());

    const recentlySent: TouchWithLead[] = leadsOut
      .flatMap((lead) =>
        lead.touches.filter((t) => t.email_status === "sent").map((t) => withLead(lead, t))
      )
      .sort((a, b) => new Date(b.sent_at as string).getTime() - new Date(a.sent_at as string).getTime())
      .slice(0, 50);

    const bounced: TouchWithLead[] = leadsOut
      .flatMap((lead) => lead.touches.filter((t) => t.bounced_at).map((t) => withLead(lead, t)))
      .sort((a, b) => new Date(b.bounced_at as string).getTime() - new Date(a.bounced_at as string).getTime());

    const pendingDeliverySync = leadsOut
      .flatMap((lead) => lead.touches.filter((t) => t.email_status === "sent" && !t.delivered_at && !t.bounced_at))
      .length;

    return NextResponse.json({
      leads: leadsOut,
      upcoming3Days,
      recentlySent,
      bounced,
      pendingDeliverySync,
    });
  } catch (err) {
    console.error("[marketing/outreach-status]", err);
    return NextResponse.json({ error: "Failed to load outreach status" }, { status: 500 });
  }
}
