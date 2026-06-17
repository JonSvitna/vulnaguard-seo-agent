import { QUALIFIER_PROMPT, COPYWRITER_PROMPT } from "./systemPrompts";
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

async function callAI(agentName: string, system: string, userContent: string, maxTokens: number): Promise<string> {
  const config = await getProviderForAgent(agentName);

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
    return res.choices[0]?.message?.content ?? '';
  } else {
    const client = makeAnthropicClient();
    const message = await client.messages.create({
      model: config.model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: userContent }],
    });
    return message.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join('');
  }
}

export async function qualifyLead(lead: OutreachLead): Promise<QualifierResult> {
  const raw = await callAI('qualifier', QUALIFIER_PROMPT, `Lead profile:\n\n${leadProfile(lead)}`, 500);
  const parsed = parseJson(raw) as Partial<QualifierResult>;

  if (typeof parsed.score !== "number" || typeof parsed.score_reason !== "string") {
    throw new Error("Missing required field in AI response: score or score_reason");
  }

  return { score: parsed.score, score_reason: parsed.score_reason };
}

export async function draftSequence(lead: OutreachLead, personaSlug?: string | null, outreachIntent?: string | null): Promise<CopywriterResult> {
  let systemPrompt = COPYWRITER_PROMPT;

  if (personaSlug) {
    const rows = await query<{ body: string }>(
      `SELECT body FROM personas WHERE slug = $1`,
      [personaSlug]
    );
    if (rows.length) {
      systemPrompt = `## Sender Persona\n\n${rows[0].body}\n\n---\n\n${COPYWRITER_PROMPT}`;
    } else {
      console.warn(`[outreach] persona not found in DB: ${personaSlug}`);
    }
  }

  const intentSection = outreachIntent?.trim()
    ? `## Outreach Goal\n\n${outreachIntent.trim()}\n\n`
    : "";
  const userContent = `${intentSection}Lead profile:\n\n${leadProfile(lead)}\n\nFit score: ${lead.score}/10\nFit reason: ${lead.score_reason ?? "n/a"}`;
  const raw = await callAI('copywriter', systemPrompt, userContent, 4000);
  const parsed = parseJson(raw) as Partial<CopywriterResult>;

  if (!Array.isArray(parsed.emails) || parsed.emails.length !== 3) {
    throw new Error("Missing required field in AI response: emails");
  }
  if (typeof parsed.linkedin_message !== "string") {
    throw new Error("Missing required field in AI response: linkedin_message");
  }

  return { emails: parsed.emails, linkedin_message: parsed.linkedin_message };
}
