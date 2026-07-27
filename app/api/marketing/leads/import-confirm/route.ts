import { NextRequest, NextResponse } from "next/server";
import { query, ensureSchema } from "@/lib/db";
import { qualifyAndUpdateLead } from "@/lib/marketing/qualify";
import { rejectAlreadyContactedLeads } from "@/lib/marketing/external-dedup";
import { isValidEmailFormat } from "@/lib/marketing/validate-email";
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
    const { mapping, all_rows, persona_slug, category, business_line } = await req.json() as {
      mapping: Mapping;
      all_rows: RawRow[];
      persona_slug?: string | null;
      category?: string;
      business_line?: string;
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
           source, status, score, persona_slug, category, business_line
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'csv_import','discovered',0,$11,$12,$13)
         RETURNING *`,
        [
          fields.company_name, fields.website ?? null, fields.location ?? null,
          fields.org_type ?? null, fields.cmmc_level_sought ?? null,
          fields.employee_count ?? null, fields.contact_name ?? null,
          fields.contact_title ?? null, fields.contact_email ?? null,
          fields.contact_linkedin ?? null, persona_slug ?? null, category ?? "sales",
          business_line ?? "cmmc",
        ]
      );
      inserted.push(rows[0]);
    }

    // Cross-check against Ai-Marketing's sent-email history before scoring —
    // no point qualifying a lead we've already emailed from the other app.
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

    // The qualifier's scoring rubrics are CMMC/Sentinel-specific — only auto-run it
    // for that business line. Other lines (e.g. website_dev) stay 'discovered' until
    // a dedicated rubric exists, rather than being scored against the wrong criteria.
    const qualified = await Promise.all(
      inserted.map(async (lead) => {
        if (externallyRejected.has(lead.id)) return { ...lead, status: "rejected" };
        if (invalidEmailIds.has(lead.id)) return { ...lead, status: "invalid_email" };
        if ((lead.business_line ?? "cmmc") !== "cmmc") return lead;
        try { return await qualifyAndUpdateLead(lead); }
        catch (err) {
          console.error("[import-confirm] qualify failed for lead", lead.id, err);
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
       VALUES ('csv_import', 'success', $1, $2, NOW())`,
      [inserted.length, JSON.stringify({
        total_rows: all_rows.length,
        imported: inserted.length,
        skipped_duplicates: skipped,
        already_contacted: alreadyContactedCount,
        invalid_email: invalidEmailCount,
        qualified: qualifiedCount,
        disqualified: disqualifiedCount,
        persona_slug: persona_slug ?? null,
      })]
    );

    return NextResponse.json({
      extracted: all_rows.length,
      imported: inserted.length,
      skipped_duplicates: skipped,
      already_contacted: alreadyContactedCount,
      invalid_email: invalidEmailCount,
      qualified: qualifiedCount,
      disqualified: disqualifiedCount,
      leads: qualified,
    });
  } catch (err) {
    console.error("[marketing/leads/import-confirm]", err);
    return NextResponse.json({ error: "Import failed. Please try again." }, { status: 500 });
  }
}
