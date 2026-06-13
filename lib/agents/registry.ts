import { qualifyLead, draftSequence } from "@/vulnaguard-marketing-agents/agents/outreach";
import type { OutreachLead } from "@/vulnaguard-marketing-agents/agents/outreach/types";
import { extractLeads } from "@/vulnaguard-marketing-agents/agents/scout";
import { runContentPipelineAgent } from "@/vulnaguard-marketing-agents/agents/content-pipeline";
import type { ContentPipelineInput } from "@/vulnaguard-marketing-agents/agents/content-pipeline/types";

export interface AgentDefinition<TInput, TOutput> {
  name: string;
  description: string;
  run: (input: TInput) => Promise<TOutput>;
}

type AnyAgentDefinition = AgentDefinition<unknown, unknown>;

export const AGENT_REGISTRY: Record<string, AnyAgentDefinition> = {
  qualifier: {
    name: "qualifier",
    description: "Scores a lead's fit for CMMC compliance services on a 0-10 scale.",
    run: (input) => qualifyLead(input as OutreachLead),
  },

  copywriter: {
    name: "copywriter",
    description: "Drafts a 3-touch email sequence and a LinkedIn message for a qualified lead.",
    run: (input) => draftSequence(input as OutreachLead),
  },

  scout: {
    name: "scout",
    description: "Extracts up to 25 candidate leads from raw pasted text.",
    run: (input) => extractLeads((input as { rawText: string }).rawText),
  },

  "content-pipeline": {
    name: "content-pipeline",
    description: "Turns a raw idea into multi-platform social content and a video brief.",
    run: (input) => runContentPipelineAgent(input as ContentPipelineInput),
  },
};

export function getAgent(name: string): AnyAgentDefinition | undefined {
  return AGENT_REGISTRY[name];
}
