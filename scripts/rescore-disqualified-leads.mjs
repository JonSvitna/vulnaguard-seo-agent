// Re-evaluates disqualified leads with a revised rubric that credits
// government-database membership as a qualification signal, not just
// CMMC-level/employee-count fields (which were empty for ~all of the
// 2026-06-17 bulk import). Read-only: writes a report, does not touch the DB.
//
// Usage: node --env-file=.env.local scripts/rescore-disqualified-leads.mjs
//
// Output: reports/disqualified-rescore-<timestamp>.csv and .md (summary)

import { Pool } from "pg";
import Anthropic from "@anthropic-ai/sdk";
import { writeFileSync, mkdirSync } from "fs";

const BATCH_SIZE = 25;
const MODEL = "claude-haiku-4-5-20251001";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: /\blocalhost\b|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "")
    ? false
    : { rejectUnauthorized: false },
  max: 5,
});

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are Sean's lead re-qualification engine for Vulnaguard, a company whose Sentinel product gives small and mid-size defense subcontractors continuous CMMC compliance monitoring.

All leads in this batch came from a small business government contractor database. That means every one of them is already registered as a government contractor, subcontractor, or vendor — this is a real qualification signal on its own, even when fields like CMMC level or employee count are blank. Do not penalize a lead just for missing those fields; missing data means "unknown," not "disqualified."

For each lead, decide:
1. new_score (0-10): fit for Vulnaguard Sentinel, weighing government-database membership as a baseline positive signal. Score higher for defense-adjacent org types, named reachable contacts, and any hint of handling government/DoD data or contracts. Score lower only for clear non-fits (e.g. retail, hospitality, no plausible government tie beyond bare registration).
2. recommended_category: one of "sales" (direct buyer of compliance product), "partnership" (could refer clients, white-label, or co-sell — e.g. MSPs, consultants, IT services firms), "referral" (well-connected but not a buyer), or "relationship_building" (too early/unclear, worth a soft touch).
3. outreach_tone: a short phrase describing how to approach them (e.g. "direct compliance pitch", "partner/co-sell pitch", "warm intro, no hard ask").
4. reasoning: one plain sentence justifying the above.

Respond ONLY with a JSON array, one object per lead in the same order given, no markdown fences, no preamble:
[{"id": 123, "new_score": 7, "recommended_category": "sales", "outreach_tone": "direct compliance pitch", "reasoning": "..."}]`;

function leadToPromptLine(lead) {
  return [
    `id=${lead.id}`,
    `company="${lead.company_name}"`,
    `org_type=${lead.org_type ?? "unknown"}`,
    `employee_count=${lead.employee_count ?? "unknown"}`,
    `cmmc_level_sought=${lead.cmmc_level_sought ?? "unknown"}`,
    `location=${lead.location ?? "unknown"}`,
    `contact=${lead.contact_name ?? "none"}${lead.contact_title ? ` (${lead.contact_title})` : ""}`,
    `has_contact_method=${Boolean(lead.contact_email || lead.contact_linkedin)}`,
    `website=${lead.website ?? "none"}`,
    `prior_score=${lead.score}`,
    `prior_reason="${lead.score_reason ?? ""}"`,
  ].join(", ");
}

async function rescoreBatch(leads) {
  const userPrompt = leads.map(leadToPromptLine).join("\n");
  const resp = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });
  const rawText = resp.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
  const text = rawText
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "");
  try {
    return JSON.parse(text);
  } catch {
    console.error("Failed to parse batch response:\n", text);
    return leads.map((l) => ({
      id: l.id,
      new_score: l.score,
      recommended_category: "sales",
      outreach_tone: "PARSE_ERROR",
      reasoning: "Model response did not parse as JSON; re-run this batch.",
    }));
  }
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function main() {
  const { rows: leads } = await pool.query(
    `SELECT id, company_name, website, location, org_type, cmmc_level_sought,
            employee_count, contact_name, contact_title, contact_email,
            contact_linkedin, status, score, score_reason, category
     FROM leads
     WHERE status = 'disqualified'
     ORDER BY id`
  );

  console.log(`Found ${leads.length} disqualified leads. Batching in groups of ${BATCH_SIZE}...`);

  const batches = chunk(leads, BATCH_SIZE);
  const byId = new Map(leads.map((l) => [l.id, l]));
  const results = [];

  for (let i = 0; i < batches.length; i++) {
    console.log(`Batch ${i + 1}/${batches.length} (${batches[i].length} leads)...`);
    const batchResults = await rescoreBatch(batches[i]);
    results.push(...batchResults);
  }

  const rows = results.map((r) => {
    const lead = byId.get(r.id);
    return {
      id: r.id,
      company_name: lead?.company_name ?? "",
      website: lead?.website ?? "",
      prior_status: lead?.status ?? "",
      prior_score: lead?.score ?? "",
      prior_category: lead?.category ?? "",
      new_score: r.new_score,
      recommended_category: r.recommended_category,
      outreach_tone: r.outreach_tone,
      reasoning: r.reasoning,
      suggested_status: r.new_score >= 4 ? "qualified" : "disqualified",
    };
  });

  mkdirSync("reports", { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const csvPath = `reports/disqualified-rescore-${ts}.csv`;
  const mdPath = `reports/disqualified-rescore-${ts}.md`;

  const csvHeader = Object.keys(rows[0] ?? {}).join(",");
  const csvLines = rows.map((r) =>
    Object.values(r)
      .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
      .join(",")
  );
  writeFileSync(csvPath, [csvHeader, ...csvLines].join("\n"));

  const flippedToQualified = rows.filter(
    (r) => r.suggested_status === "qualified"
  ).length;
  const categoryCounts = rows.reduce((acc, r) => {
    acc[r.recommended_category] = (acc[r.recommended_category] ?? 0) + 1;
    return acc;
  }, {});

  const summary = [
    `# Disqualified lead re-score report (${ts})`,
    "",
    `- Total leads re-evaluated: ${rows.length}`,
    `- Would flip disqualified -> qualified (score >= 4): ${flippedToQualified}`,
    `- Recommended category breakdown: ${JSON.stringify(categoryCounts)}`,
    `- Full data: ${csvPath}`,
    "",
    "No database writes were made. Review the CSV, then decide which leads to",
    "re-qualify and what outreach tone to apply before any pipeline action.",
  ].join("\n");
  writeFileSync(mdPath, summary);

  console.log("\n" + summary);
  await pool.end();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
