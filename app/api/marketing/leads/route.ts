import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const status = req.nextUrl.searchParams.get("status");

    const leads = status
      ? await query(
          `SELECT * FROM leads WHERE status = $1 ORDER BY updated_at DESC`,
          [status]
        )
      : await query(`SELECT * FROM leads ORDER BY updated_at DESC`);

    return NextResponse.json({ leads });
  } catch (err) {
    console.error("[marketing/leads GET]", err);
    return NextResponse.json({ error: "Failed to load leads" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (!body.company_name?.trim()) {
      return NextResponse.json({ error: "company_name is required" }, { status: 400 });
    }

    const rows = await query(
      `INSERT INTO leads
         (company_name, website, location, org_type, cmmc_level_sought, employee_count,
          contact_name, contact_title, contact_email, contact_linkedin, source, status, score, score_reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING *`,
      [
        body.company_name.trim(),
        body.website ?? null,
        body.location ?? null,
        body.org_type ?? null,
        body.cmmc_level_sought ?? null,
        body.employee_count ?? null,
        body.contact_name ?? null,
        body.contact_title ?? null,
        body.contact_email ?? null,
        body.contact_linkedin ?? null,
        body.source ?? "manual",
        body.status ?? "discovered",
        body.score ?? 0,
        body.score_reason ?? null,
      ]
    );

    return NextResponse.json({ lead: rows[0] }, { status: 201 });
  } catch (err) {
    console.error("[marketing/leads POST]", err);
    return NextResponse.json({ error: "Failed to create lead" }, { status: 500 });
  }
}
