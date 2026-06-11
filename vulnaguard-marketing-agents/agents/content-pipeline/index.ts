import Anthropic from "@anthropic-ai/sdk";
import { BRAND_PROMPTS } from "./systemPrompt";
import type { ContentPipelineInput, GeneratedContent, VideoBrief } from "./types";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function runContentPipelineAgent(
  input: ContentPipelineInput
): Promise<GeneratedContent> {
  const brand = input.brand ?? "vulnaguard";
  const systemPrompt = BRAND_PROMPTS[brand];

  if (!systemPrompt) {
    throw new Error(`No system prompt found for brand: ${brand}`);
  }

  if (!input.rawInput?.trim()) {
    throw new Error("Raw input is required");
  }

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4000,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: `Raw input to turn into content:\n\n${input.rawInput.trim()}`,
      },
    ],
  });

  const raw = message.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("");

  const clean = raw.replace(/```json|```/g, "").trim();

  let parsed: GeneratedContent;
  try {
    parsed = JSON.parse(clean);
  } catch {
    throw new Error("Failed to parse content from AI response");
  }

  // Validate required fields
  const required: (keyof GeneratedContent)[] = [
    "core_idea",
    "linkedin",
    "instagram",
    "facebook",
    "youtube_desc",
    "youtube_short",
    "video_brief",
  ];

  for (const field of required) {
    if (!parsed[field]) {
      throw new Error(`Missing required field in AI response: ${field}`);
    }
  }

  return parsed;
}

export async function generateVideoScript(input: {
  brief: VideoBrief;
  coreIdea: string;
  brand?: string;
}): Promise<string> {
  const brand = input.brand ?? "vulnaguard";
  const systemPrompt = BRAND_PROMPTS[brand];

  if (!systemPrompt) {
    throw new Error(`No system prompt found for brand: ${brand}`);
  }

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1500,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: `Turn this video brief into a full word-for-word script Sean can read straight to camera, in his voice. Aim for 45-75 seconds of natural spoken pacing (roughly 110-160 words). Plain spoken text only, with paragraph breaks at natural pauses — no stage directions, no markdown, no headers, no timestamps.

Core idea: ${input.coreIdea}

Hook: ${input.brief.hook}

Key points:
${input.brief.points.map((p, i) => `${i + 1}. ${p}`).join("\n")}

CTA: ${input.brief.cta}`,
      },
    ],
  });

  const text = message.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("")
    .trim();

  if (!text) {
    throw new Error("Failed to generate video script");
  }

  return text;
}
