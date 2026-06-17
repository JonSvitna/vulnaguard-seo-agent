import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

const EDITABLE_FIELDS = [
  "company_name",
  "website",
  "location",
  "org_type",
  "cmmc_level_sought",
  "employee_count",
  "contact_name",
  "contact_title",
  "contact_email",
  "contact_linkedin",
  "source",
  "status",
  "score",
  "score_reason",
  "persona_slug",
  "outreach_intent",
  "category",
  "skill_slugs",
];

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const leads = await query(`SELECT * FROM leads WHERE id = $1`, [id]);
    if (!leads.length) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const sequences = await query(
      `SELECT * FROM sequences WHERE lead_id = $1 ORDER BY id DESC LIMIT 1`,
      [id]
    );
    const sequence = sequences[0] ?? null;

    let emails: unknown[] = [];
    let linkedin_message: unknown = null;
    if (sequence) {
      emails = await query(
        `SELECT * FROM emails WHERE sequence_id = $1 ORDER BY touch_number ASC`,
        [(sequence as { id: number }).id]
      );
      const linkedinRows = await query(
        `SELECT * FROM linkedin_messages WHERE sequence_id = $1 LIMIT 1`,
        [(sequence as { id: number }).id]
      );
      linkedin_message = linkedinRows[0] ?? null;
    }

    return NextResponse.json({
      lead: leads[0],
      sequence,
      emails,
      linkedin_message,
    });
  } catch (err) {
    console.error("[marketing/leads/[id] GET]", err);
    return NextResponse.json({ error: "Failed to load lead" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();

    const fields = Object.keys(body).filter((k) => EDITABLE_FIELDS.includes(k));
    if (fields.length === 0) {
      return NextResponse.json({ error: "No editable fields provided" }, { status: 400 });
    }

    // Changing category invalidates the existing score, which was computed against
    // a different rubric — route the lead back through discovered for re-qualification.
    if ("category" in body) {
      const current = await query<{ category: string }>(`SELECT category FROM leads WHERE id = $1`, [id]);
      if (current.length && current[0].category !== body.category) {
        if (!fields.includes("status")) fields.push("status");
        if (!fields.includes("score")) fields.push("score");
        if (!fields.includes("score_reason")) fields.push("score_reason");
        body.status = "discovered";
        body.score = 0;
        body.score_reason = null;
        if (!fields.includes("skill_slugs")) fields.push("skill_slugs");
        body.skill_slugs = [];
      }
    }

    const setClauses = fields.map((f, i) => `${f} = $${i + 1}`);
    const values = fields.map((f) => body[f]);

    const rows = await query(
      `UPDATE leads SET ${setClauses.join(", ")}, updated_at = NOW()
       WHERE id = $${fields.length + 1}
       RETURNING *`,
      [...values, id]
    );

    if (!rows.length) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    return NextResponse.json({ lead: rows[0] });
  } catch (err) {
    console.error("[marketing/leads/[id] PATCH]", err);
    return NextResponse.json({ error: "Failed to update lead" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await query(`DELETE FROM leads WHERE id = $1`, [id]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[marketing/leads/[id] DELETE]", err);
    return NextResponse.json({ error: "Failed to delete lead" }, { status: 500 });
  }
}
