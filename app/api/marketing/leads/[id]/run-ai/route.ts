import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { qualifyLead, draftSequence } from "@/vulnaguard-marketing-agents/agents/outreach";
import type { OutreachLead } from "@/vulnaguard-marketing-agents/agents/outreach/types";


export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    let leads = await query<OutreachLead>(`SELECT * FROM leads WHERE id = $1`, [id]);
    if (!leads.length) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }
    let lead = leads[0];

    if (lead.status === "discovered") {
      const result = await qualifyLead(lead);

      const configRows = await query<{ value: string }>(
        `SELECT value FROM agent_config WHERE key = 'qualifier_min_score'`
      );
      const threshold = Number(configRows[0]?.value);
      const minScore = Number.isFinite(threshold) ? threshold : 6;

      const newStatus = result.score >= minScore ? "qualified" : "disqualified";

      leads = await query<OutreachLead>(
        `UPDATE leads SET score = $1, score_reason = $2, status = $3, updated_at = NOW()
         WHERE id = $4 RETURNING *`,
        [result.score, result.score_reason, newStatus, id]
      );
      lead = leads[0];
    }

    if (lead.status === "qualified") {
      const draft = await draftSequence(lead);
      return NextResponse.json({ lead, draft });
    }

    return NextResponse.json({ lead, draft: null });
  } catch (err) {
    console.error("[marketing/leads/[id]/run-ai]", err);
    return NextResponse.json({ error: "AI run failed. Please try again." }, { status: 500 });
  }
}
