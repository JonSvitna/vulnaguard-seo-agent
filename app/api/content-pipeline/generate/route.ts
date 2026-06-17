import { NextRequest, NextResponse } from "next/server";
import { runContentPipeline } from "@/vulnaguard-marketing-agents/pipeline/content-pipeline";
import type { CaptureMode } from "@/vulnaguard-marketing-agents/agents/content-pipeline/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { rawInput, captureMode, brand, voiceSkillSlug } = body;

    if (!rawInput?.trim()) {
      return NextResponse.json(
        { error: "rawInput is required" },
        { status: 400 }
      );
    }

    if (!["type", "voice", "video"].includes(captureMode)) {
      return NextResponse.json(
        { error: "captureMode must be type | voice | video" },
        { status: 400 }
      );
    }

    const record = await runContentPipeline({
      rawInput: rawInput.trim(),
      captureMode: captureMode as CaptureMode,
      brand: brand ?? "vulnaguard",
      voiceSkillSlug: voiceSkillSlug ?? null,
    });

    return NextResponse.json({ success: true, record });
  } catch (err) {
    console.error("[content-pipeline/generate]", err);
    return NextResponse.json(
      { error: "Content generation failed. Please try again." },
      { status: 500 }
    );
  }
}
