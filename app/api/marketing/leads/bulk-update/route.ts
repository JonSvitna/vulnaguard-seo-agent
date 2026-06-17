import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

// One-shot admin endpoint: bulk-set category + status on all leads (or filtered by category).
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      ids?: number[];
      set_category?: string;
      set_status?: string;
      where_category?: string;
    };

    const sets: string[] = [];
    const values: unknown[] = [];

    if (body.set_category) { values.push(body.set_category); sets.push(`category = $${values.length}`); }
    if (body.set_status)   { values.push(body.set_status);   sets.push(`status = $${values.length}`); }

    if (sets.length === 0) {
      return NextResponse.json({ error: "Nothing to set" }, { status: 400 });
    }

    let where = "";
    if (Array.isArray(body.ids) && body.ids.length > 0) {
      values.push(body.ids);
      where = `WHERE id = ANY($${values.length}::int[])`;
    } else if (body.where_category) {
      values.push(body.where_category);
      where = `WHERE category = $${values.length}`;
    }

    const rows = await query<{ id: number }>(
      `UPDATE leads SET ${sets.join(", ")}, updated_at = NOW() ${where} RETURNING id`,
      values
    );

    return NextResponse.json({ updated: rows.length });
  } catch (err) {
    console.error("[marketing/leads/bulk-update]", err);
    return NextResponse.json({ error: "Bulk update failed" }, { status: 500 });
  }
}
