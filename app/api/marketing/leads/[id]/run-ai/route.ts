import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { draftSequence } from "@/vulnaguard-marketing-agents/agents/outreach";
import type { OutreachLead } from "@/vulnaguard-marketing-agents/agents/outreach/types";
import { qualifyAndUpdateLead } from "@/lib/marketing/qualify";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const leads = await query<OutreachLead>(`SELECT * FROM leads WHERE id = $1`, [id]);
    if (!leads.length) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }
    let lead = leads[0];

    if (lead.status === "discovered") {
      lead = await qualifyAndUpdateLead(lead);
    }

    if (lead.status === "qualified") {
      const draft = await draftSequence(lead, lead.persona_slug as string | null);
      return NextResponse.json({ lead, draft });
    }

    return NextResponse.json({ lead, draft: null });
  } catch (err) {
    console.error("[marketing/leads/[id]/run-ai]", err);
    return NextResponse.json({ error: "AI run failed. Please try again." }, { status: 500 });
  }
}
