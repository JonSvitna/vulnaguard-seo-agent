import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    await query(`DELETE FROM personas WHERE slug = $1`, [slug]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[marketing/personas DELETE]", err);
    return NextResponse.json({ error: "Failed to delete persona" }, { status: 500 });
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const rows = await query<{ slug: string; name: string; body: string }>(
      `SELECT slug, name, body FROM personas WHERE slug = $1`,
      [slug]
    );
    if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ persona: rows[0] });
  } catch (err) {
    console.error("[marketing/personas/[slug] GET]", err);
    return NextResponse.json({ error: "Failed to load persona" }, { status: 500 });
  }
}
