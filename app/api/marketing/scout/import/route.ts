import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { extractLeads } from "@/vulnaguard-marketing-agents/agents/scout";
import { qualifyAndUpdateLead } from "@/lib/marketing/qualify";
import { rejectAlreadyContactedLeads } from "@/lib/marketing/external-dedup";
import { isValidEmailFormat } from "@/lib/marketing/validate-email";
import type { OutreachLead } from "@/vulnaguard-marketing-agents/agents/outreach/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rawText: string = body.raw_text ?? "";
    const category: string = body.category ?? "sales";

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

    const inserted: OutreachLead[] = [];
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

      const rows = await query<OutreachLead>(
        `INSERT INTO leads (company_name, website, location, org_type, cmmc_level_sought,
           employee_count, contact_name, contact_title, contact_email, contact_linkedin,
           source, status, score, category)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'scout_import', 'discovered', 0, $11)
         RETURNING *`,
        [
          lead.company_name, lead.website, lead.location, lead.org_type, lead.cmmc_level_sought,
          lead.employee_count, lead.contact_name, lead.contact_title, lead.contact_email, lead.contact_linkedin,
          category,
        ]
      );
      inserted.push(rows[0]);
    }

    const externallyRejected = await rejectAlreadyContactedLeads(inserted);

    // Validate: a present-but-badly-formatted email can never be sent to, so park
    // it in 'invalid_email' before it ever enters the qualify/draft pipeline —
    // syntax/format check only, no MX lookup or paid verification API.
    const invalidEmailIds = new Set<number>();
    for (const lead of inserted) {
      if (externallyRejected.has(lead.id)) continue;
      if (lead.contact_email?.trim() && !isValidEmailFormat(lead.contact_email)) {
        await query(`UPDATE leads SET status = 'invalid_email', updated_at = NOW() WHERE id = $1`, [lead.id]);
        invalidEmailIds.add(lead.id);
      }
    }

    const qualified = await Promise.all(
      inserted.map(async (lead) => {
        if (externallyRejected.has(lead.id)) return { ...lead, status: "rejected" };
        if (invalidEmailIds.has(lead.id)) return { ...lead, status: "invalid_email" };
        try {
          return await qualifyAndUpdateLead(lead);
        } catch (err) {
          console.error("[marketing/scout/import] qualify failed for lead", lead.id, err);
          return lead;
        }
      })
    );

    const qualifiedCount = qualified.filter((l) => l.status === "qualified").length;
    const disqualifiedCount = qualified.filter((l) => l.status === "disqualified").length;
    const alreadyContactedCount = externallyRejected.size;
    const invalidEmailCount = invalidEmailIds.size;

    await query(
      `INSERT INTO pipeline_runs (agent, status, leads_processed, details, finished_at)
       VALUES ('scout', 'success', $1, $2, NOW())`,
      [inserted.length, JSON.stringify({
        extracted: extracted.length,
        imported: inserted.length,
        skipped_duplicates: skipped,
        already_contacted: alreadyContactedCount,
        invalid_email: invalidEmailCount,
        qualified: qualifiedCount,
        disqualified: disqualifiedCount,
      })]
    );

    return NextResponse.json({
      extracted: extracted.length,
      imported: inserted.length,
      skipped_duplicates: skipped,
      already_contacted: alreadyContactedCount,
      invalid_email: invalidEmailCount,
      qualified: qualifiedCount,
      disqualified: disqualifiedCount,
      leads: qualified,
    });
  } catch (err) {
    console.error("[marketing/scout/import]", err);
    return NextResponse.json({ error: "Bulk import failed. Please try again." }, { status: 500 });
  }
}
