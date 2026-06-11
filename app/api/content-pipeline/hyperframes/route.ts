import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import type { VideoBrief } from "@/vulnaguard-marketing-agents/agents/content-pipeline/types";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const brief: VideoBrief = body.brief;

    if (!brief?.hook || !brief?.points || !brief?.cta) {
      return NextResponse.json(
        { error: "Valid video brief is required" },
        { status: 400 }
      );
    }

    const prompt = `Create a Vulnaguard branded security content video.

Hook: ${brief.hook}

Key Points:
${brief.points.map((p, i) => `${i + 1}. ${p}`).join("\n")}

CTA: ${brief.cta}

Style: Professional, authoritative, navy and gold color scheme. Use the signal design preset. This is for a cybersecurity compliance company targeting small and mid-size businesses. Keep it clean, confident, and human — not fear-based.`;

    const message = await (anthropic as any).messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
      mcp_servers: [
        {
          type: "url",
          url: "https://mcp.heygen.com/mcp/hyperframes",
          name: "hyperframes",
        },
      ],
    });

    // Extract project ID from MCP tool result if present
    const toolResult = message.content?.find(
      (b: any) => b.type === "mcp_tool_result"
    );

    const textBlock = message.content?.find((b: any) => b.type === "text");

    return NextResponse.json({
      success: true,
      projectCreated: !!toolResult,
      message: textBlock?.text ?? "Video project submitted to HyperFrames.",
    });
  } catch (err) {
    console.error("[content-pipeline/hyperframes]", err);
    return NextResponse.json(
      { error: "HyperFrames generation failed." },
      { status: 500 }
    );
  }
}
