import { NextRequest, NextResponse } from "next/server";
import { getProviderForAgent, makeOpenAIClient, makeAnthropicClient } from "@/lib/ai-provider";

const PERSONA_DRAFT_SYSTEM = `You write structured voice/persona profiles for outreach copywriter AI agents.

Given the user's self-description, produce a markdown document with exactly these sections:

## Tone Overview
2-3 sentences describing the overall voice.

## Writing Philosophy
The core belief behind how this person communicates. 2-3 sentences.

## Phrases to Use
A bullet list of 6-10 short phrases this person naturally says.

## Phrases to Avoid
A bullet list of 6-10 phrases that would never come from this person — corporate speak, AI-sounding filler, buzzwords they hate.

## Example Sentences
3 example sentences written in this voice that could appear in a cold outreach email.

Be specific. Pull directly from what the user described. Do not be generic. Output only the markdown document — no preamble, no explanation.`;

export async function POST(req: NextRequest) {
  try {
    const { description, skill_type } = await req.json() as {
      description?: string;
      skill_type?: string;
    };

    if (!description?.trim()) {
      return NextResponse.json({ error: "description is required" }, { status: 400 });
    }

    const userMsg = skill_type === "voice"
      ? `Write a voice skill profile for this person:\n\n${description.trim()}`
      : `Write an outreach persona profile for this person:\n\n${description.trim()}`;

    const config = await getProviderForAgent("default");
    let body: string;

    if (config.provider === "openai") {
      const client = makeOpenAIClient();
      const res = await client.chat.completions.create({
        model: config.model,
        max_tokens: 800,
        messages: [
          { role: "system", content: PERSONA_DRAFT_SYSTEM },
          { role: "user", content: userMsg },
        ],
      });
      body = res.choices[0]?.message?.content ?? "";
    } else {
      const client = makeAnthropicClient();
      const msg = await client.messages.create({
        model: config.model,
        max_tokens: 800,
        system: PERSONA_DRAFT_SYSTEM,
        messages: [{ role: "user", content: userMsg }],
      });
      body = msg.content
        .filter(b => b.type === "text")
        .map(b => (b as { type: "text"; text: string }).text)
        .join("");
    }

    if (!body.trim()) {
      return NextResponse.json({ error: "AI returned empty response" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, body: body.trim() });
  } catch (err) {
    console.error("[marketing/personas/draft-ai]", err);
    return NextResponse.json({ error: "Failed to generate persona" }, { status: 500 });
  }
}
