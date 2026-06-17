import { BASE_CONTENT_PROMPT, BRAND_PROMPTS } from "./systemPrompt";
import { getProviderForAgent, makeOpenAIClient, makeAnthropicClient } from "@/lib/ai-provider";
import { query } from "@/lib/db";
import type { ContentPipelineInput, GeneratedContent, VideoBrief } from "./types";

async function callAI(system: string, user: string, maxTokens: number): Promise<string> {
  const config = await getProviderForAgent('content-pipeline');

  if (config.provider === 'openai') {
    const client = makeOpenAIClient();
    const res = await client.chat.completions.create({
      model: config.model,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    });
    return res.choices[0]?.message?.content ?? '';
  }

  const client = makeAnthropicClient();
  const msg = await client.messages.create({
    model: config.model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: user }],
  });
  return msg.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('');
}

async function buildSystemPrompt(brand: string, voiceSkillSlug?: string | null): Promise<string> {
  // Try loading voice skill from DB
  if (voiceSkillSlug) {
    const rows = await query<{ body: string }>(
      `SELECT body FROM personas WHERE slug = $1 AND skill_type = 'voice'`,
      [voiceSkillSlug]
    );
    if (rows.length) {
      return `## Voice & Tone\n\n${rows[0].body}\n\n---\n\n${BASE_CONTENT_PROMPT}`;
    }
  }
  // Fallback: full hardcoded brand prompt (includes voice)
  return BRAND_PROMPTS[brand] ?? BRAND_PROMPTS['vulnaguard'];
}

export async function runContentPipelineAgent(
  input: ContentPipelineInput & { voiceSkillSlug?: string | null }
): Promise<GeneratedContent> {
  const brand = input.brand ?? 'vulnaguard';

  if (!input.rawInput?.trim()) {
    throw new Error('Raw input is required');
  }

  const systemPrompt = await buildSystemPrompt(brand, input.voiceSkillSlug);
  const raw = await callAI(
    systemPrompt,
    `Raw input to turn into content:\n\n${input.rawInput.trim()}`,
    4000
  );

  const clean = raw.replace(/```json|```/g, '').trim();
  let parsed: GeneratedContent;
  try {
    parsed = JSON.parse(clean);
  } catch {
    throw new Error('Failed to parse content from AI response');
  }

  const required: (keyof GeneratedContent)[] = [
    'core_idea', 'linkedin', 'instagram', 'facebook', 'youtube_desc', 'youtube_short', 'video_brief',
  ];
  for (const field of required) {
    if (!parsed[field]) throw new Error(`Missing required field in AI response: ${field}`);
  }

  return parsed;
}

export async function generateVideoScript(input: {
  brief: VideoBrief;
  coreIdea: string;
  brand?: string;
  voiceSkillSlug?: string | null;
}): Promise<string> {
  const brand = input.brand ?? 'vulnaguard';
  const systemPrompt = await buildSystemPrompt(brand, input.voiceSkillSlug);

  const script = await callAI(
    systemPrompt,
    `Turn this video brief into a full word-for-word script Sean can read straight to camera, in his voice. Aim for 45-75 seconds of natural spoken pacing (roughly 110-160 words). Plain spoken text only, with paragraph breaks at natural pauses — no stage directions, no markdown, no headers, no timestamps.

Core idea: ${input.coreIdea}

Hook: ${input.brief.hook}

Key points:
${input.brief.points.map((p, i) => `${i + 1}. ${p}`).join('\n')}

CTA: ${input.brief.cta}`,
    1500
  );

  if (!script) throw new Error('Failed to generate video script');
  return script.trim();
}
