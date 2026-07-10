import { z } from "zod";
import { BASE_CONTENT_PROMPT, BRAND_PROMPTS } from "./systemPrompt";
import { getProviderForAgent, makeOpenAIClient, makeAnthropicClient } from "@/lib/ai-provider";
import { query } from "@/lib/db";
import type { ContentPipelineInput, GeneratedContent, VideoBrief } from "./types";

const storyboardSchema = z.object({
  beats: z.array(
    z.object({
      order: z.number(),
      kind: z.enum(["hook", "point", "cta"]),
      content: z.string(),
      start_sec: z.number(),
      duration_sec: z.number(),
      graphic: z.enum(["CornerCard", "SideList", "WordStack", "none"]),
    })
  ),
  total_duration_sec: z.number(),
  hyperframes_recommended: z.boolean(),
  hyperframes_reason: z.string().nullable(),
});

// The LLM is only prompted to *try* to emit a valid storyboard — this is a real runtime
// boundary (model output, not our own code), so a shape mismatch must degrade to `null`
// rather than fail the whole generation. Callers (render-worker, IntakeClip) already
// treat `storyboard: null` as "fall back to today's even-spacing beat placement."
function validateStoryboard(raw: unknown): GeneratedContent["storyboard"] {
  const result = storyboardSchema.safeParse(raw);
  if (!result.success) {
    console.warn(
      "[content-pipeline] storyboard failed validation, persisting null:",
      result.error.message
    );
    return null;
  }
  return result.data;
}

interface DesignConcept extends Record<string, unknown> {
  concept_tags: string[];
  palette: unknown;
  beat_style_notes: string | null;
  transitions_used: string[];
}

async function fetchDesignConcepts(brand: string, limit = 3): Promise<DesignConcept[]> {
  try {
    return await query<DesignConcept>(
      `SELECT concept_tags, palette, beat_style_notes, transitions_used
       FROM design_concepts
       WHERE brand = $1
       ORDER BY extracted_at DESC
       LIMIT $2`,
      [brand, limit]
    );
  } catch (err) {
    // design_concepts is a newer, best-effort input to generation — never let a lookup
    // failure (e.g. table not yet migrated in some environment) break content generation.
    console.warn("[content-pipeline] design_concepts lookup failed, continuing without it:", err);
    return [];
  }
}

function formatDesignConceptsBlock(concepts: DesignConcept[]): string {
  if (!concepts.length) return "";
  const lines = concepts.map((c, i) => {
    const palette = c.palette ? JSON.stringify(c.palette) : "n/a";
    const transitions = c.transitions_used?.length ? c.transitions_used.join(", ") : "n/a";
    const tags = c.concept_tags?.length ? c.concept_tags.join(", ") : "n/a";
    return `${i + 1}. tags: ${tags} | palette: ${palette} | transitions: ${transitions}${
      c.beat_style_notes ? ` | notes: ${c.beat_style_notes}` : ""
    }`;
  });
  return `\n\n## Design concepts you can reuse\n${lines.join("\n")}\n`;
}

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
  const designConcepts = await fetchDesignConcepts(brand);
  const userMessage = `Raw input to turn into content:\n\n${input.rawInput.trim()}${formatDesignConceptsBlock(
    designConcepts
  )}`;
  const raw = await callAI(systemPrompt, userMessage, 4000);

  const clean = raw.replace(/```json|```/g, '').trim();
  let parsed: GeneratedContent;
  try {
    parsed = JSON.parse(clean);
  } catch {
    throw new Error('Failed to parse content from AI response');
  }

  // storyboard is intentionally excluded here — a missing/malformed storyboard degrades
  // to null via validateStoryboard() below rather than failing the whole generation
  // (the linkedin/instagram/etc. drafts are still valuable even without one).
  const required: (keyof GeneratedContent)[] = [
    'core_idea', 'linkedin', 'instagram', 'facebook', 'youtube_desc', 'youtube_short', 'video_brief',
  ];
  for (const field of required) {
    if (!parsed[field]) throw new Error(`Missing required field in AI response: ${field}`);
  }

  parsed.storyboard = validateStoryboard(parsed.storyboard);

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
