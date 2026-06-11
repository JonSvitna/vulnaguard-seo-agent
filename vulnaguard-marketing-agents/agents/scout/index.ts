import Anthropic from "@anthropic-ai/sdk";
import { EXTRACTOR_PROMPT } from "./systemPrompts";
import type { ExtractedLead } from "./types";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function extractLeads(rawText: string): Promise<ExtractedLead[]> {
  if (!rawText?.trim()) {
    throw new Error("Raw text is required");
  }

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4000,
    system: EXTRACTOR_PROMPT,
    messages: [
      {
        role: "user",
        content: `Raw text to extract leads from:\n\n${rawText.trim()}`,
      },
    ],
  });

  const raw = message.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("");

  const clean = raw.replace(/```json|```/g, "").trim();

  let parsed: { leads?: unknown };
  try {
    parsed = JSON.parse(clean);
  } catch {
    throw new Error("Failed to parse leads from AI response");
  }

  if (!Array.isArray(parsed.leads)) {
    throw new Error("Missing required field in AI response: leads");
  }

  return (parsed.leads as Partial<ExtractedLead>[])
    .filter((l): l is ExtractedLead => typeof l.company_name === "string" && l.company_name.trim().length > 0)
    .map((l) => ({
      company_name: l.company_name,
      website: l.website ?? null,
      location: l.location ?? null,
      org_type: l.org_type ?? null,
      cmmc_level_sought: l.cmmc_level_sought ?? null,
      employee_count: l.employee_count ?? null,
      contact_name: l.contact_name ?? null,
      contact_title: l.contact_title ?? null,
      contact_email: l.contact_email ?? null,
      contact_linkedin: l.contact_linkedin ?? null,
    }));
}
