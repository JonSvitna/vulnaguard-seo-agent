import Anthropic from "@anthropic-ai/sdk";
import { QUALIFIER_PROMPT, COPYWRITER_PROMPT } from "./systemPrompts";
import type { OutreachLead, QualifierResult, CopywriterResult } from "./types";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

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

function extractText(message: Anthropic.Message): string {
  return message.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("");
}

function parseJson(raw: string): unknown {
  const clean = raw.replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(clean);
  } catch {
    throw new Error("Failed to parse JSON from AI response");
  }
}

export async function qualifyLead(lead: OutreachLead): Promise<QualifierResult> {
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 500,
    system: QUALIFIER_PROMPT,
    messages: [
      {
        role: "user",
        content: `Lead profile:\n\n${leadProfile(lead)}`,
      },
    ],
  });

  const parsed = parseJson(extractText(message)) as Partial<QualifierResult>;

  if (typeof parsed.score !== "number" || typeof parsed.score_reason !== "string") {
    throw new Error("Missing required field in AI response: score or score_reason");
  }

  return { score: parsed.score, score_reason: parsed.score_reason };
}

export async function draftSequence(lead: OutreachLead): Promise<CopywriterResult> {
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4000,
    system: COPYWRITER_PROMPT,
    messages: [
      {
        role: "user",
        content: `Lead profile:\n\n${leadProfile(lead)}\n\nFit score: ${lead.score}/10\nFit reason: ${lead.score_reason ?? "n/a"}`,
      },
    ],
  });

  const parsed = parseJson(extractText(message)) as Partial<CopywriterResult>;

  if (!Array.isArray(parsed.emails) || parsed.emails.length !== 3) {
    throw new Error("Missing required field in AI response: emails");
  }
  if (typeof parsed.linkedin_message !== "string") {
    throw new Error("Missing required field in AI response: linkedin_message");
  }

  return { emails: parsed.emails, linkedin_message: parsed.linkedin_message };
}
