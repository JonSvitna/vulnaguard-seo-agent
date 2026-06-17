import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { draftSequence } from "@/vulnaguard-marketing-agents/agents/outreach";
import type { OutreachLead } from "@/vulnaguard-marketing-agents/agents/outreach/types";
import { qualifyAndUpdateLead } from "@/lib/marketing/qualify";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({})) as {
      persona_slug?: string | null;
      force_qualify?: boolean;
      outreach_intent?: string | null;
      skill_slugs?: string[] | null;
    };

    const leads = await query<OutreachLead>(`SELECT * FROM leads WHERE id = $1`, [id]);
    if (!leads.length) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }
    let lead = leads[0];

    // Persist persona + intent overrides if caller provided them
    if ("persona_slug" in body) {
      await query(`UPDATE leads SET persona_slug = $1, updated_at = NOW() WHERE id = $2`, [body.persona_slug ?? null, id]);
      lead = { ...lead, persona_slug: body.persona_slug ?? null };
    }
    if ("outreach_intent" in body) {
      await query(`UPDATE leads SET outreach_intent = $1, updated_at = NOW() WHERE id = $2`, [body.outreach_intent ?? null, id]);
      lead = { ...lead, outreach_intent: body.outreach_intent ?? null };
    }
    if ("skill_slugs" in body) {
      await query(`UPDATE leads SET skill_slugs = $1, updated_at = NOW() WHERE id = $2`, [body.skill_slugs ?? [], id]);
      lead = { ...lead, skill_slugs: body.skill_slugs ?? [] };
    }

    // Run qualification if needed
    if (lead.status === "discovered") {
      lead = await qualifyAndUpdateLead(lead);
    }

    // force_qualify overrides a disqualified result
    if (body.force_qualify && lead.status === "disqualified") {
      const rows = await query<OutreachLead>(
        `UPDATE leads SET status = 'qualified', updated_at = NOW() WHERE id = $1 RETURNING *`,
        [id]
      );
      lead = rows[0];
    }

    if (lead.status !== "qualified") {
      return NextResponse.json({ lead, draft: null });
    }

    const personaSlug = ("persona_slug" in body ? body.persona_slug : lead.persona_slug) as string | null;
    const outreachIntent = ("outreach_intent" in body ? body.outreach_intent : lead.outreach_intent) ?? null;
    let skillSlugs = ("skill_slugs" in body ? body.skill_slugs : lead.skill_slugs) as string[] | null;

    // Fall back to Sean's voice when no skills are selected and no persona chosen
    if (!personaSlug && (!skillSlugs || skillSlugs.length === 0)) {
      const defaultVoice = await query<{ slug: string }>(
        `SELECT slug FROM personas WHERE slug = 'seans-voice-vulnaguard' AND skill_type = 'voice' LIMIT 1`
      );
      if (defaultVoice.length) skillSlugs = [defaultVoice[0].slug];
    }

    const draft = await draftSequence(lead, personaSlug, outreachIntent, skillSlugs);

    // Auto-persist draft immediately — lead advances to 'drafted' regardless of whether
    // the user clicks Save in the modal. Prevents silent loss on modal close.
    await query(`DELETE FROM sequences WHERE lead_id = $1`, [id]);
    const seqs = await query<{ id: number }>(
      `INSERT INTO sequences (lead_id, status) VALUES ($1, 'drafted') RETURNING id`,
      [id]
    );
    const seqId = seqs[0].id;

    for (const e of draft.emails) {
      await query(
        `INSERT INTO emails (sequence_id, lead_id, touch_number, subject, body, status)
         VALUES ($1, $2, $3, $4, $5, 'drafted')`,
        [seqId, id, e.touch_number, e.subject, e.body]
      );
    }

    if (draft.linkedin_message?.trim()) {
      await query(
        `INSERT INTO linkedin_messages (sequence_id, lead_id, message, status)
         VALUES ($1, $2, $3, 'drafted')`,
        [seqId, id, draft.linkedin_message]
      );
    }

    const updated = await query<OutreachLead>(
      `UPDATE leads SET status = 'drafted', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id]
    );

    return NextResponse.json({ lead: updated[0], draft });
  } catch (err) {
    console.error("[marketing/leads/[id]/run-ai]", err);
    return NextResponse.json({ error: "AI run failed. Please try again." }, { status: 500 });
  }
}
