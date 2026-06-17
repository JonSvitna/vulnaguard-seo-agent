import { NextRequest, NextResponse } from "next/server";
import { generateVideoScript } from "@/vulnaguard-marketing-agents/agents/content-pipeline";
import { query } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { recordId, brief, coreIdea, brand, voiceSkillSlug } = body;

    if (!brief?.hook || !brief?.points || !brief?.cta) {
      return NextResponse.json(
        { error: "Valid video brief is required" },
        { status: 400 }
      );
    }

    const script = await generateVideoScript({
      brief,
      coreIdea: coreIdea ?? "",
      brand: brand ?? "vulnaguard",
      voiceSkillSlug: voiceSkillSlug ?? null,
    });

    if (recordId) {
      await query(
        `UPDATE content_pipeline_records SET video_script = $1 WHERE id = $2`,
        [script, recordId]
      );
    }

    return NextResponse.json({ success: true, script });
  } catch (err) {
    console.error("[content-pipeline/script]", err);
    return NextResponse.json(
      { error: "Script generation failed. Please try again." },
      { status: 500 }
    );
  }
}
