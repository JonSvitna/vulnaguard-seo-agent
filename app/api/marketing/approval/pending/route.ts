import { NextResponse } from "next/server";
import { query } from "@/lib/db";


export async function GET() {
  try {
    const sequences = await query<{
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
    }>(
      `SELECT s.id, s.lead_id, s.status, s.created_at,
              l.company_name, l.location, l.cmmc_level_sought, l.score, l.contact_name, l.contact_email
       FROM sequences s
       JOIN leads l ON l.id = s.lead_id
       WHERE s.status = 'drafted'
       ORDER BY s.created_at ASC`
    );

    const result = [];
    for (const seq of sequences) {
      const emails = await query(
        `SELECT touch_number, subject, body FROM emails WHERE sequence_id = $1 ORDER BY touch_number ASC`,
        [seq.id]
      );
      const linkedinRows = await query<{ message: string }>(
        `SELECT message FROM linkedin_messages WHERE sequence_id = $1 LIMIT 1`,
        [seq.id]
      );

      result.push({
        id: seq.id,
        lead_id: seq.lead_id,
        company_name: seq.company_name,
        location: seq.location,
        cmmc_level_sought: seq.cmmc_level_sought,
        score: seq.score,
        contact_name: seq.contact_name,
        contact_email: seq.contact_email,
        created_at: seq.created_at,
        emails,
        linkedin_message: linkedinRows[0]?.message ?? "",
      });
    }

    return NextResponse.json({ pending: result });
  } catch (err) {
    console.error("[marketing/approval/pending]", err);
    return NextResponse.json({ error: "Failed to load approval queue" }, { status: 500 });
  }
}
