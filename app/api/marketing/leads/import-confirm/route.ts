import { NextRequest, NextResponse } from "next/server";
import { query, ensureSchema } from "@/lib/db";
import { qualifyAndUpdateLead } from "@/lib/marketing/qualify";
import type { OutreachLead } from "@/vulnaguard-marketing-agents/agents/outreach/types";

type LeadField =
  | "company_name" | "website" | "location" | "org_type" | "cmmc_level_sought"
  | "employee_count" | "contact_name" | "contact_title" | "contact_email" | "contact_linkedin";

type Mapping = Record<LeadField, string | null>;
type RawRow = Record<string, string>;

function applyMapping(row: RawRow, mapping: Mapping): Partial<Record<LeadField, string | null>> {
  const result: Partial<Record<LeadField, string | null>> = {};
  for (const [field, header] of Object.entries(mapping) as [LeadField, string | null][]) {
    result[field] = header ? (row[header]?.trim() || null) : null;
  }
  return result;
}

export async function POST(req: NextRequest) {
  try {
    await ensureSchema();
    const { mapping, all_rows, persona_slug } = await req.json() as {
      mapping: Mapping;
      all_rows: RawRow[];
      persona_slug?: string | null;
    };

    if (!mapping || !Array.isArray(all_rows)) {
      return NextResponse.json({ error: "mapping and all_rows are required" }, { status: 400 });
    }

    const inserted: OutreachLead[] = [];
    let skipped = 0;

    for (const row of all_rows) {
      const fields = applyMapping(row, mapping);
      if (!fields.company_name?.trim()) continue;

      const existing = await query(
        `SELECT id FROM leads WHERE LOWER(company_name) = LOWER($1)`,
        [fields.company_name]
      );
      if (existing.length) { skipped++; continue; }

      const rows = await query<OutreachLead>(
        `INSERT INTO leads (
           company_name, website, location, org_type, cmmc_level_sought,
           employee_count, contact_name, contact_title, contact_email, contact_linkedin,
           source, status, score, persona_slug
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'csv_import','discovered',0,$11)
         RETURNING *`,
        [
          fields.company_name, fields.website ?? null, fields.location ?? null,
          fields.org_type ?? null, fields.cmmc_level_sought ?? null,
          fields.employee_count ?? null, fields.contact_name ?? null,
          fields.contact_title ?? null, fields.contact_email ?? null,
          fields.contact_linkedin ?? null, persona_slug ?? null,
        ]
      );
      inserted.push(rows[0]);
    }

    const qualified = await Promise.all(
      inserted.map(async (lead) => {
        try { return await qualifyAndUpdateLead(lead); }
        catch (err) {
          console.error("[import-confirm] qualify failed for lead", lead.id, err);
          return lead;
        }
      })
    );

    const qualifiedCount = qualified.filter((l) => l.status === "qualified").length;
    const disqualifiedCount = qualified.filter((l) => l.status === "disqualified").length;

    await query(
      `INSERT INTO pipeline_runs (agent, status, leads_processed, details, finished_at)
       VALUES ('csv_import', 'success', $1, $2, NOW())`,
      [inserted.length, JSON.stringify({
        total_rows: all_rows.length,
        imported: inserted.length,
        skipped_duplicates: skipped,
        qualified: qualifiedCount,
        disqualified: disqualifiedCount,
        persona_slug: persona_slug ?? null,
      })]
    );

    return NextResponse.json({
      extracted: all_rows.length,
      imported: inserted.length,
      skipped_duplicates: skipped,
      qualified: qualifiedCount,
      disqualified: disqualifiedCount,
      leads: qualified,
    });
  } catch (err) {
    console.error("[marketing/leads/import-confirm]", err);
    return NextResponse.json({ error: "Import failed. Please try again." }, { status: 500 });
  }
}
