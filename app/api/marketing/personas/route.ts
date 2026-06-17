import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

interface PersonaRow extends Record<string, unknown> {
  slug: string;
  name: string;
  body: string;
  skill_type: string;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const typeFilter = searchParams.get("type"); // 'persona' | 'voice' | null (all)

    const rows = await query<PersonaRow>(
      typeFilter
        ? `SELECT slug, name, body, skill_type FROM personas WHERE skill_type = $1 ORDER BY name ASC`
        : `SELECT slug, name, body, skill_type FROM personas ORDER BY name ASC`,
      typeFilter ? [typeFilter] : undefined
    );
    const personas = rows.map(r => ({
      slug: r.slug,
      name: r.name,
      skill_type: r.skill_type,
      preview: r.body
        .split("\n")
        .filter(l => !l.startsWith("#") && l.trim().length > 0)
        .join(" ")
        .replace(/\*\*/g, "")
        .trim()
        .slice(0, 140),
      body: r.body,
    }));
    return NextResponse.json({ personas });
  } catch (err) {
    console.error("[marketing/personas GET]", err);
    return NextResponse.json({ error: "Failed to load personas" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { slug, name, body, skill_type } = await req.json() as {
      slug?: string;
      name?: string;
      body?: string;
      skill_type?: string;
    };

    if (!name?.trim() || !body?.trim()) {
      return NextResponse.json({ error: "name and body are required" }, { status: 400 });
    }

    const finalSlug = slug?.trim() ||
      name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const finalType = skill_type === "voice" ? "voice" : "persona";

    await query(
      `INSERT INTO personas (slug, name, body, skill_type, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (slug) DO UPDATE SET name = $2, body = $3, skill_type = $4, updated_at = NOW()`,
      [finalSlug, name.trim(), body.trim(), finalType]
    );

    return NextResponse.json({ ok: true, slug: finalSlug });
  } catch (err) {
    console.error("[marketing/personas POST]", err);
    return NextResponse.json({ error: "Failed to save persona" }, { status: 500 });
  }
}
