import { query } from "@/lib/db";
import { runAgent } from "@/lib/agents/runAgent";
import { classifyLeadCategory } from "@/vulnaguard-marketing-agents/agents/outreach";
import type { OutreachLead, QualifierResult } from "@/vulnaguard-marketing-agents/agents/outreach/types";

export async function qualifyAndUpdateLead(lead: OutreachLead): Promise<OutreachLead> {
  // Re-classify category at scoring time instead of trusting the single
  // batch-wide category picked at import — mixed CSV uploads (e.g. a
  // government cert list) contain a blend of sales/partnership/referral
  // contacts that a single dropdown can't capture per-row.
  let category = lead.category ?? "sales";
  try {
    category = (await classifyLeadCategory(lead)).category;
  } catch (err) {
    console.error("[qualify] classification failed for lead", lead.id, err);
  }
  const classifiedLead = { ...lead, category };

  const result = (await runAgent("qualifier", classifiedLead)) as QualifierResult;

  const configRows = await query<{ value: string }>(
    `SELECT value FROM agent_config WHERE key = 'qualifier_min_score'`
  );
  const threshold = Number(configRows[0]?.value);
  const minScore = Number.isFinite(threshold) ? threshold : 6;

  const newStatus = result.score >= minScore ? "qualified" : "disqualified";

  const rows = await query<OutreachLead>(
    `UPDATE leads SET score = $1, score_reason = $2, status = $3, category = $4, updated_at = NOW()
     WHERE id = $5 RETURNING *`,
    [result.score, result.score_reason, newStatus, category, lead.id]
  );
  return rows[0];
}
