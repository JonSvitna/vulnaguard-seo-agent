import { QUALIFIER_PROMPTS, COPYWRITER_PROMPT, CATEGORY_CONTEXT } from "./systemPrompts";
import { getProviderForAgent, makeOpenAIClient, makeAnthropicClient } from "@/lib/ai-provider";
import { query } from "@/lib/db";
import type { OutreachLead, QualifierResult, CopywriterResult } from "./types";

function leadProfile(lead: OutreachLead): string {
  return `Company: ${lead.company_name}
Website: ${lead.website ?? "unknown"}
Location: ${lead.location ?? "unknown"}
Org type: ${lead.org_type ?? "unknown"}
CMMC level sought: ${lead.cmmc_level_sought ?? "unknown"}
Employee count: ${lead.employee_count ?? "unknown"}
Contact name: ${lead.contact_name ?? "unknown"}
Contact title: ${lead.contact_title ?? "unknown"}
Contact email: ${lead.contact_email ?? "unknown"}
Contact LinkedIn: ${lead.contact_linkedin ?? "unknown"}`;
}

function parseJson(raw: string): unknown {
  const clean = raw.replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(clean);
  } catch {
    throw new Error("Failed to parse JSON from AI response");
  }
}

async function logPromptRun(args: {
  agentName: string;
  leadId: number | null;
  provider: string;
  model: string;
  system: string;
  userContent: string;
  startedAt: Date;
  response?: string;
  status: "success" | "error";
  error?: string;
}): Promise<void> {
  try {
    await query(
      `INSERT INTO prompt_runs (agent_name, lead_id, provider, model, system_prompt, user_prompt, response, status, error, duration_ms, started_at, finished_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())`,
      [
        args.agentName,
        args.leadId,
        args.provider,
        args.model,
        args.system,
        args.userContent,
        args.response ?? null,
        args.status,
        args.error ?? null,
        Date.now() - args.startedAt.getTime(),
        args.startedAt,
      ],
    );
  } catch (err) {
    console.error("[outreach] failed to log prompt_runs row", err);
  }
}

async function callAI(agentName: string, system: string, userContent: string, maxTokens: number, leadId: number | null = null): Promise<string> {
  const config = await getProviderForAgent(agentName);
  const startedAt = new Date();

  try {
    let text: string;
    if (config.provider === 'openai') {
      const client = makeOpenAIClient();
      const res = await client.chat.completions.create({
        model: config.model,
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userContent },
        ],
      });
      text = res.choices[0]?.message?.content ?? '';
    } else {
      const client = makeAnthropicClient();
      const message = await client.messages.create({
        model: config.model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: userContent }],
      });
      text = message.content
        .filter((b) => b.type === 'text')
        .map((b) => (b as { type: 'text'; text: string }).text)
        .join('');
    }

    await logPromptRun({ agentName, leadId, provider: config.provider, model: config.model, system, userContent, startedAt, response: text, status: "success" });
    return text;
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI call failed";
    await logPromptRun({ agentName, leadId, provider: config.provider, model: config.model, system, userContent, startedAt, status: "error", error: message });
    throw err;
  }
}

export async function qualifyLead(lead: OutreachLead): Promise<QualifierResult> {
  const prompt = QUALIFIER_PROMPTS[lead.category ?? "sales"] ?? QUALIFIER_PROMPTS.sales;
  const raw = await callAI('qualifier', prompt, `Lead profile:\n\n${leadProfile(lead)}`, 500, lead.id ?? null);
  const parsed = parseJson(raw) as Partial<QualifierResult>;

  if (typeof parsed.score !== "number" || typeof parsed.score_reason !== "string") {
    throw new Error("Missing required field in AI response: score or score_reason");
  }

  return { score: parsed.score, score_reason: parsed.score_reason };
}

export async function draftSequence(lead: OutreachLead, personaSlug?: string | null, outreachIntent?: string | null, skillSlugs?: string[] | null): Promise<CopywriterResult> {
  let systemPrompt = COPYWRITER_PROMPT;

  // Stack voice skills above the base prompt
  const slugsToLoad = skillSlugs?.filter(Boolean) ?? [];
  if (slugsToLoad.length) {
    const rows = await query<{ slug: string; name: string; body: string }>(
      `SELECT slug, name, body FROM personas WHERE slug = ANY($1) AND skill_type = 'voice'`,
      [slugsToLoad]
    );
    if (rows.length) {
      const skillBlocks = rows.map(r => `## Voice Skill: ${r.name}\n\n${r.body}`).join("\n\n");
      systemPrompt = `${skillBlocks}\n\n---\n\n${COPYWRITER_PROMPT}`;
    }
  }

  // Sender persona wraps above the skills block
  if (personaSlug) {
    const rows = await query<{ body: string }>(
      `SELECT body FROM personas WHERE slug = $1`,
      [personaSlug]
    );
    if (rows.length) {
      systemPrompt = `## Sender Persona\n\n${rows[0].body}\n\n---\n\n${systemPrompt}`;
    } else {
      console.warn(`[outreach] persona not found in DB: ${personaSlug}`);
    }
  }

  const categoryContext = lead.category ? CATEGORY_CONTEXT[lead.category] : undefined;
  const categorySection = categoryContext ? `## Lead Category\n\n${categoryContext}\n\n` : "";
  const intentSection = outreachIntent?.trim()
    ? `## Outreach Goal\n\n${outreachIntent.trim()}\n\n`
    : "";
  const userContent = `${categorySection}${intentSection}Lead profile:\n\n${leadProfile(lead)}\n\nFit score: ${lead.score}/10\nFit reason: ${lead.score_reason ?? "n/a"}`;
  const raw = await callAI('copywriter', systemPrompt, userContent, 4000, lead.id ?? null);
  const parsed = parseJson(raw) as Partial<CopywriterResult>;

  if (!Array.isArray(parsed.emails) || parsed.emails.length !== 3) {
    throw new Error("Missing required field in AI response: emails");
  }
  if (typeof parsed.linkedin_message !== "string") {
    throw new Error("Missing required field in AI response: linkedin_message");
  }

  return { emails: parsed.emails, linkedin_message: parsed.linkedin_message };
}
