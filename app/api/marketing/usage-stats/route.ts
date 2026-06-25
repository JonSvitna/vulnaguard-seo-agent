import { NextResponse } from "next/server";
import { query } from "@/lib/db";

// Published list pricing, USD per 1M tokens. Approximate for non-Anthropic
// models since pricing isn't fetched live — good enough for a cost estimate,
// not a billing source of truth.
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5-20251001": { input: 1, output: 5 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-opus-4-6": { input: 15, output: 75 },
  "gpt-4.1": { input: 2, output: 8 },
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
};

interface SentDayRow extends Record<string, unknown> {
  day: string;
  sent: string;
  delivered: string;
  bounced: string;
}

interface TokenRow extends Record<string, unknown> {
  agent_name: string;
  model: string;
  calls: string;
  input_tokens: string | null;
  output_tokens: string | null;
}

interface FunnelRow extends Record<string, unknown> {
  status: string;
  count: string;
}

export async function GET() {
  try {
    const sentByDay = await query<SentDayRow>(
      `SELECT
         to_char(date_trunc('day', sent_at), 'YYYY-MM-DD') AS day,
         COUNT(*)::text AS sent,
         COUNT(delivered_at)::text AS delivered,
         COUNT(bounced_at)::text AS bounced
       FROM emails
       WHERE sent_at IS NOT NULL AND sent_at >= NOW() - INTERVAL '30 days'
       GROUP BY 1
       ORDER BY 1 ASC`
    );

    const tokenRows = await query<TokenRow>(
      `SELECT agent_name, model, COUNT(*)::text AS calls,
              SUM(input_tokens)::text AS input_tokens, SUM(output_tokens)::text AS output_tokens
       FROM prompt_runs
       WHERE status = 'success' AND started_at >= NOW() - INTERVAL '30 days'
       GROUP BY agent_name, model
       ORDER BY agent_name ASC`
    );

    const tokenUsage = tokenRows.map((r) => {
      const inputTokens = Number(r.input_tokens) || 0;
      const outputTokens = Number(r.output_tokens) || 0;
      const pricing = MODEL_PRICING[r.model];
      const estimatedCost = pricing
        ? (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output
        : null;
      return {
        agent_name: r.agent_name,
        model: r.model,
        calls: Number(r.calls),
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        estimated_cost: estimatedCost,
      };
    });

    const totalCost = tokenUsage.reduce((sum, t) => sum + (t.estimated_cost ?? 0), 0);
    const totalInputTokens = tokenUsage.reduce((sum, t) => sum + t.input_tokens, 0);
    const totalOutputTokens = tokenUsage.reduce((sum, t) => sum + t.output_tokens, 0);

    const funnelRows = await query<FunnelRow>(
      `SELECT status, COUNT(*)::text AS count FROM leads GROUP BY status`
    );
    const funnelByStatus = new Map(funnelRows.map((r) => [r.status, Number(r.count)]));
    const FUNNEL_STAGES = ["discovered", "qualified", "drafted", "approved", "sent"] as const;
    const funnel = FUNNEL_STAGES.map((stage) => ({ stage, count: funnelByStatus.get(stage) ?? 0 }));

    return NextResponse.json({
      sentOverTime: sentByDay.map((r) => ({
        day: r.day,
        sent: Number(r.sent),
        delivered: Number(r.delivered),
        bounced: Number(r.bounced),
      })),
      tokenUsage,
      totals: { cost: totalCost, input_tokens: totalInputTokens, output_tokens: totalOutputTokens },
      funnel,
    });
  } catch (err) {
    console.error("[marketing/usage-stats]", err);
    return NextResponse.json({ error: "Failed to load usage stats" }, { status: 500 });
  }
}
