import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { query } from "@/lib/db";
import { getProviderForAgent, makeOpenAIClient, makeAnthropicClient } from "@/lib/ai-provider";

interface RecordRow extends Record<string, unknown> {
  id: string;
  core_idea: string;
  video_brief: { hook: string; points: string[]; cta: string; style: string };
  youtube_short: string;
  brand: string;
}

export async function POST(req: NextRequest) {
  try {
    const { record_id, voice_skill_slug } = await req.json() as {
      record_id?: string;
      voice_skill_slug?: string | null;
    };

    if (!record_id) {
      return NextResponse.json({ error: "record_id is required" }, { status: 400 });
    }

    const records = await query<RecordRow>(
      `SELECT id, core_idea, video_brief, youtube_short, brand FROM content_pipeline_records WHERE id = $1`,
      [record_id]
    );
    if (!records.length) {
      return NextResponse.json({ error: "Record not found" }, { status: 404 });
    }
    const record = records[0];
    const brief = record.video_brief as RecordRow['video_brief'];

    // Load HyperFrames skill from disk (repo file — always present)
    const skillPath = path.join(process.cwd(), ".claude", "skills", "hyperframes", "SKILL.md");
    let hyperframesSkill = "";
    try {
      hyperframesSkill = fs.readFileSync(skillPath, "utf-8");
    } catch {
      console.warn("[content-pipeline/hyperframes] SKILL.md not found at", skillPath);
      hyperframesSkill = "HyperFrames is a framework for building animated HTML video compositions using components like Caption Pill Karaoke, VFX Portal, VFX Shatter, and App Showcase.";
    }

    // Load voice skill from DB
    let voiceSkillBody = "";
    if (voice_skill_slug) {
      const rows = await query<{ body: string }>(
        `SELECT body FROM personas WHERE slug = $1 AND skill_type = 'voice'`,
        [voice_skill_slug]
      );
      if (rows.length) voiceSkillBody = rows[0].body;
    }

    const metaPrompt = `You are writing a Claude Code prompt that will be pasted into a Claude Code terminal session to build a HyperFrames video composition. The output must be a single, complete, self-contained prompt that Claude Code can execute immediately.

## HyperFrames Skill Reference
${hyperframesSkill}

${voiceSkillBody ? `## Voice & Tone\n${voiceSkillBody}\n` : ""}
## Video Brief
Core idea: ${record.core_idea}
Hook: ${brief.hook}
Key points:
${brief.points.map((p: string, i: number) => `${i + 1}. ${p}`).join("\n")}
CTA: ${brief.cta}
Style signal: ${brief.style}

YouTube Shorts script for reference:
${record.youtube_short}

## Your Task
Write a complete Claude Code prompt that:
1. References specific HyperFrames components by exact name for each scene/beat
2. Specifies the text content, timing (seconds), and animation style for each component
3. Applies the voice/tone guidelines to all on-screen text
4. Produces a single self-contained HTML file
5. Matches the pacing of a 60-second short-form video
6. Starts with "/hyperframes" to invoke the skill

Output the prompt text only — no explanation, no preamble, no markdown wrapper around the prompt itself.`;

    const config = await getProviderForAgent('content-pipeline');
    let generatedPrompt: string;

    if (config.provider === 'openai') {
      const client = makeOpenAIClient();
      const res = await client.chat.completions.create({
        model: config.model,
        max_tokens: 2000,
        messages: [
          { role: 'system', content: 'You write precise, executable Claude Code prompts for HyperFrames video composition.' },
          { role: 'user', content: metaPrompt },
        ],
      });
      generatedPrompt = res.choices[0]?.message?.content ?? '';
    } else {
      const client = makeAnthropicClient();
      const msg = await client.messages.create({
        model: config.model,
        max_tokens: 2000,
        system: 'You write precise, executable Claude Code prompts for HyperFrames video composition.',
        messages: [{ role: 'user', content: metaPrompt }],
      });
      generatedPrompt = msg.content
        .filter((b) => b.type === 'text')
        .map((b) => (b as { type: 'text'; text: string }).text)
        .join('');
    }

    if (!generatedPrompt.trim()) {
      return NextResponse.json({ error: "AI returned empty prompt" }, { status: 500 });
    }

    // Persist to record
    await query(
      `UPDATE content_pipeline_records SET hyperframes_prompt = $1 WHERE id = $2`,
      [generatedPrompt.trim(), record_id]
    );

    return NextResponse.json({ ok: true, prompt: generatedPrompt.trim() });
  } catch (err) {
    console.error("[content-pipeline/hyperframes]", err);
    return NextResponse.json({ error: "HyperFrames prompt generation failed" }, { status: 500 });
  }
}
