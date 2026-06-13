import { query } from "@/lib/db";
import { runAgent } from "@/lib/agents/runAgent";
import type { OutreachLead, QualifierResult } from "@/vulnaguard-marketing-agents/agents/outreach/types";

export async function qualifyAndUpdateLead(lead: OutreachLead): Promise<OutreachLead> {
  const result = (await runAgent("qualifier", lead)) as QualifierResult;

  const configRows = await query<{ value: string }>(
    `SELECT value FROM agent_config WHERE key = 'qualifier_min_score'`
  );
  const threshold = Number(configRows[0]?.value);
  const minScore = Number.isFinite(threshold) ? threshold : 6;

  const newStatus = result.score >= minScore ? "qualified" : "disqualified";

  const rows = await query<OutreachLead>(
    `UPDATE leads SET score = $1, score_reason = $2, status = $3, updated_at = NOW()
     WHERE id = $4 RETURNING *`,
    [result.score, result.score_reason, newStatus, lead.id]
  );
  return rows[0];
}
