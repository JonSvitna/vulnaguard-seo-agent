import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

interface SeqRow extends Record<string, unknown> {
  id: number;
  lead_id: number;
  status: string;
  created_at: string;
  company_name: string;
  location: string | null;
  cmmc_level_sought: string | null;
  score: number;
  contact_name: string | null;
  contact_email: string | null;
}

interface EmailRow extends Record<string, unknown> {
  sequence_id: number;
  touch_number: number;
  subject: string | null;
  body: string | null;
}

interface LinkedinRow extends Record<string, unknown> {
  sequence_id: number;
  message: string;
}

export async function GET(req: NextRequest) {
  try {
    const page = Math.max(1, Number(req.nextUrl.searchParams.get("page")) || 1);
    const limit = Math.min(200, Math.max(1, Number(req.nextUrl.searchParams.get("limit")) || 50));
    const offset = (page - 1) * limit;

    const totalRows = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM sequences WHERE status = 'drafted'`
    );
    const total = Number(totalRows[0]?.count) || 0;

    const sequences = await query<SeqRow>(
      `SELECT s.id, s.lead_id, s.status, s.created_at,
              l.company_name, l.location, l.cmmc_level_sought, l.score, l.contact_name, l.contact_email
       FROM sequences s
       JOIN leads l ON l.id = s.lead_id
       WHERE s.status = 'drafted'
       ORDER BY s.created_at ASC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    const seqIds = sequences.map((s) => s.id);
    const emailsBySeq = new Map<number, { touch_number: number; subject: string | null; body: string | null }[]>();
    const linkedinBySeq = new Map<number, string>();

    if (seqIds.length) {
      const emails = await query<EmailRow>(
        `SELECT sequence_id, touch_number, subject, body FROM emails WHERE sequence_id = ANY($1) ORDER BY touch_number ASC`,
        [seqIds]
      );
      for (const e of emails) {
        if (!emailsBySeq.has(e.sequence_id)) emailsBySeq.set(e.sequence_id, []);
        emailsBySeq.get(e.sequence_id)!.push({ touch_number: e.touch_number, subject: e.subject, body: e.body });
      }

      const linkedinRows = await query<LinkedinRow>(
        `SELECT sequence_id, message FROM linkedin_messages WHERE sequence_id = ANY($1)`,
        [seqIds]
      );
      for (const l of linkedinRows) linkedinBySeq.set(l.sequence_id, l.message);
    }

    const result = sequences.map((seq) => ({
      id: seq.id,
      lead_id: seq.lead_id,
      company_name: seq.company_name,
      location: seq.location,
      cmmc_level_sought: seq.cmmc_level_sought,
      score: seq.score,
      contact_name: seq.contact_name,
      contact_email: seq.contact_email,
      created_at: seq.created_at,
      emails: emailsBySeq.get(seq.id) ?? [],
      linkedin_message: linkedinBySeq.get(seq.id) ?? "",
    }));

    return NextResponse.json({ pending: result, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) });
  } catch (err) {
    console.error("[marketing/approval/pending]", err);
    return NextResponse.json({ error: "Failed to load approval queue" }, { status: 500 });
  }
}
