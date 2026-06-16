import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

interface PersonaEntry {
  slug: string;
  name: string;
  preview: string;
}

export async function GET() {
  try {
    const personasDir = path.join(process.cwd(), "vulnaguard-marketing-agents", "personas");

    if (!fs.existsSync(personasDir)) {
      return NextResponse.json({ personas: [] });
    }

    const files = fs.readdirSync(personasDir).filter(f => f.endsWith(".md"));

    const personas: PersonaEntry[] = files.map(file => {
      const slug = file.replace(/\.md$/, "");
      const content = fs.readFileSync(path.join(personasDir, file), "utf-8");
      const lines = content.split("\n");

      const headingLine = lines.find(l => l.startsWith("# "));
      const name = headingLine ? headingLine.replace(/^# /, "").trim() : slug;

      const bodyText = lines
        .filter(l => !l.startsWith("#") && l.trim().length > 0)
        .join(" ")
        .replace(/\*\*/g, "")
        .trim();
      const preview = bodyText.slice(0, 120);

      return { slug, name, preview };
    });

    return NextResponse.json({ personas });
  } catch (err) {
    console.error("[marketing/personas]", err);
    return NextResponse.json({ error: "Failed to load personas" }, { status: 500 });
  }
}
