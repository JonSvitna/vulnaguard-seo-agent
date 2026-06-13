import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { extractLeads } from "@/vulnaguard-marketing-agents/agents/scout";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rawText: string = body.raw_text ?? "";

    if (!rawText.trim()) {
      return NextResponse.json({ error: "raw_text is required" }, { status: 400 });
    }

    let extracted;
    try {
      extracted = await extractLeads(rawText);
    } catch (err) {
      await query(
        `INSERT INTO pipeline_runs (agent, status, leads_processed, details, finished_at)
         VALUES ('scout', 'error', 0, $1, NOW())`,
        [JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" })]
      );
      throw err;
    }

    const inserted = [];
    let skipped = 0;

    for (const lead of extracted) {
      const existing = await query(
        `SELECT id FROM leads WHERE LOWER(company_name) = LOWER($1)`,
        [lead.company_name]
      );
      if (existing.length) {
        skipped++;
        continue;
      }

      const rows = await query(
        `INSERT INTO leads (company_name, website, location, org_type, cmmc_level_sought,
           employee_count, contact_name, contact_title, contact_email, contact_linkedin,
           source, status, score)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'scout_import', 'discovered', 0)
         RETURNING *`,
        [
          lead.company_name, lead.website, lead.location, lead.org_type, lead.cmmc_level_sought,
          lead.employee_count, lead.contact_name, lead.contact_title, lead.contact_email, lead.contact_linkedin,
        ]
      );
      inserted.push(rows[0]);
    }

    await query(
      `INSERT INTO pipeline_runs (agent, status, leads_processed, details, finished_at)
       VALUES ('scout', 'success', $1, $2, NOW())`,
      [inserted.length, JSON.stringify({ extracted: extracted.length, imported: inserted.length, skipped_duplicates: skipped })]
    );

    return NextResponse.json({
      extracted: extracted.length,
      imported: inserted.length,
      skipped_duplicates: skipped,
      leads: inserted,
    });
  } catch (err) {
    console.error("[marketing/scout/import]", err);
    return NextResponse.json({ error: "Bulk import failed. Please try again." }, { status: 500 });
  }
}
