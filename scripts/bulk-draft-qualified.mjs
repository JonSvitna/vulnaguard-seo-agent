// Drafts outreach sequences for leads sitting at status='qualified' that
// pipeline/run will never touch (it only pulls status='discovered').
// Calls Anthropic directly with the same COPYWRITER_PROMPT/CATEGORY_CONTEXT
// used by the app (vulnaguard-marketing-agents/agents/outreach), throttled
// across a large backlog instead of one lead at a time from the UI.
//
// Usage:
//   node --env-file=.env.local scripts/bulk-draft-qualified.mjs [--category=sales] [--limit=200] [--delay-ms=500]

import { Pool } from "pg";
import Anthropic from "@anthropic-ai/sdk";

const args = process.argv.slice(2);
const categoryArg = args.find((a) => a.startsWith("--category="))?.split("=")[1];
const limitArg = Number(args.find((a) => a.startsWith("--limit="))?.split("=")[1]) || null;
const delayMs = Number(args.find((a) => a.startsWith("--delay-ms="))?.split("=")[1]) || 500;

const MODEL = "claude-haiku-4-5-20251001"; // matches ai_provider_config for 'copywriter'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: /\blocalhost\b|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "")
    ? false
    : { rejectUnauthorized: false },
  max: 5,
  connectionTimeoutMillis: 15_000,
  idleTimeoutMillis: 30_000,
});

pool.on("error", (err) => {
  console.error("[pool] idle client error (ignored, pool will reconnect):", err.message);
});

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CATEGORY_CONTEXT = {
  partnership: "This is a potential partner relationship, not a direct sale. Frame outreach around collaboration and mutual client benefit, not a pitch to buy Sentinel.",
  relationship_building: "This is relationship/community outreach — no ask, no CTA pressure. Focus on genuine connection and shared context, not a product pitch.",
  referral: "This is a referral relationship — the goal is an introduction or visibility within their network, not a direct sale or partnership. Frame outreach around asking them to keep Sentinel in mind for people they encounter, not a pitch to buy or partner.",
};

const COPYWRITER_PROMPT = `You are Sean's personal outreach copywriter for Vulnaguard — a web application security and compliance intelligence company with a product called Sentinel that gives small and mid-size defense subcontractors continuous CMMC compliance monitoring.

VOICE: Write in first person as Sean. You are a founder, practitioner, and someone who has personally been through the compliance grind. Not a brand account. A real person who has sat on both sides of the audit table. You speak like a coworker helping another coworker — calm, direct, human, zero pressure.

PHILOSOPHY: "It's not you. It's the setup." People don't fail compliance because they don't care. They fail because the process is confusing, the tools are overcomplicated, and nobody explained it in plain English. Every message should leave the reader feeling heard and understood — not sold to.

SHARED EXPERIENCE: Use first-person lived experience often.
Examples:
- "I've sat on that side of the table."
- "I've been through audits where more time was spent chasing paperwork than improving security."
- "I've watched good teams lose momentum simply because nobody explained the process clearly."

TONE RULES:
- Conversational, calm, direct, authoritative but accessible
- Each email body must be 150 words or fewer. Short emails don't read as AI. Be ruthlessly brief.
- NEVER use any of these phrases or words (hard ban — if you write any of these, the draft fails):
  "I hope this email finds you well" / "I hope this finds you well" / "I wanted to reach out" / "I am writing to" / "I'm excited to share" / "I'm reaching out because" / "circle back" / "touch base" / "game-changing" / "revolutionize" / "leverage" / "utilize" / "unlock" / "synergy" / "seamlessly" / "cutting-edge" / "innovative solution" / "delve into" / "in today's fast-paced" / "it's worth noting" / "I'd love to connect" / "feel free to reach out" / "don't hesitate to contact"

PHRASES TO USE: "I get it." / "That makes sense." / "That's not on you." / "Here's what I'd focus on first." / "No pressure." / "The simpler way to look at it is..." / "We've been through that ourselves."

Given a lead's profile, draft a 3-touch email sequence and one LinkedIn connection message:
- Touch 1: Problem they're likely facing (tie to their CMMC level / org type) → shared experience → soft mention of Vulnaguard Sentinel. Ends with a low-pressure CTA to join the early access waitlist at vulnaguard.com — Sentinel is in active development, not generally available yet, so don't imply a live demo or finished product.
- Touch 2 (sent a few days later): A different angle — a specific pain point or consequence of inaction, told through Sean's experience. Same soft CTA to vulnaguard.com.
- Touch 3 (final, sent about a week after touch 2): Short, polite, low-pressure check-in. Acknowledge they're busy. Leave the door open without being pushy. Same CTA to vulnaguard.com.
- LinkedIn message: Short (2-4 sentences) connection note referencing their company/role, in the same voice, no hard sell.

Each email should be addressed using the contact's first name if known, otherwise a generic but warm greeting. Sign off as "Sean\\nVulnaguard".

Respond ONLY with this JSON — no markdown fences, no preamble, no explanation:

{
  "emails": [
    { "touch_number": 1, "subject": "...", "body": "..." },
    { "touch_number": 2, "subject": "...", "body": "..." },
    { "touch_number": 3, "subject": "...", "body": "..." }
  ],
  "linkedin_message": "..."
}`;

function leadProfile(lead) {
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

function parseJson(raw) {
  const clean = raw.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

async function buildSystemPrompt(pool, lead, defaultVoiceSlug) {
  let systemPrompt = COPYWRITER_PROMPT;
  const skillSlugs = lead.skill_slugs?.length ? lead.skill_slugs : defaultVoiceSlug ? [defaultVoiceSlug] : [];

  if (skillSlugs.length) {
    const { rows } = await pool.query(
      `SELECT slug, name, body FROM personas WHERE slug = ANY($1) AND skill_type = 'voice'`,
      [skillSlugs]
    );
    if (rows.length) {
      const skillBlocks = rows.map((r) => `## Voice Skill: ${r.name}\n\n${r.body}`).join("\n\n");
      systemPrompt = `${skillBlocks}\n\n---\n\n${COPYWRITER_PROMPT}`;
    }
  }

  if (lead.persona_slug) {
    const { rows } = await pool.query(`SELECT body FROM personas WHERE slug = $1`, [lead.persona_slug]);
    if (rows.length) {
      systemPrompt = `## Sender Persona\n\n${rows[0].body}\n\n---\n\n${systemPrompt}`;
    }
  }

  return systemPrompt;
}

async function draftSequence(pool, lead, defaultVoiceSlug) {
  const systemPrompt = await buildSystemPrompt(pool, lead, defaultVoiceSlug);
  const categoryContext = lead.category ? CATEGORY_CONTEXT[lead.category] : undefined;
  const categorySection = categoryContext ? `## Lead Category\n\n${categoryContext}\n\n` : "";
  const intentSection = lead.outreach_intent?.trim() ? `## Outreach Goal\n\n${lead.outreach_intent.trim()}\n\n` : "";
  const userContent = `${categorySection}${intentSection}Lead profile:\n\n${leadProfile(lead)}\n\nFit score: ${lead.score}/10\nFit reason: ${lead.score_reason ?? "n/a"}`;

  const resp = await anthropic.messages.create(
    {
      model: MODEL,
      max_tokens: 4000,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
    },
    { timeout: 60_000 }
  );
  const text = resp.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  const parsed = parseJson(text);

  if (!Array.isArray(parsed.emails) || parsed.emails.length !== 3) {
    throw new Error("Missing required field in AI response: emails");
  }
  if (typeof parsed.linkedin_message !== "string") {
    throw new Error("Missing required field in AI response: linkedin_message");
  }
  return parsed;
}

async function main() {
  const conditions = [`status = 'qualified'`];
  const params = [];
  if (categoryArg) {
    params.push(categoryArg);
    conditions.push(`category = $${params.length}`);
  }
  let sql = `SELECT * FROM leads WHERE ${conditions.join(" AND ")} ORDER BY id ASC`;
  if (limitArg) {
    params.push(limitArg);
    sql += ` LIMIT $${params.length}`;
  }

  const { rows: leads } = await pool.query(sql, params);
  console.log(`Drafting sequences for ${leads.length} qualified leads (model=${MODEL}, delay ${delayMs}ms)...`);

  const defaultVoiceRows = await pool.query(
    `SELECT slug FROM personas WHERE slug = 'seans-voice-vulnaguard' AND skill_type = 'voice' LIMIT 1`
  );
  const defaultVoiceSlug = defaultVoiceRows.rows[0]?.slug ?? null;

  let drafted = 0;
  let errors = 0;

  for (const lead of leads) {
    try {
      const draft = await draftSequence(pool, lead, defaultVoiceSlug);

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(`DELETE FROM sequences WHERE lead_id = $1`, [lead.id]);
        const seqs = await client.query(
          `INSERT INTO sequences (lead_id, status) VALUES ($1, 'drafted') RETURNING id`,
          [lead.id]
        );
        const seqId = seqs.rows[0].id;

        for (const e of draft.emails) {
          await client.query(
            `INSERT INTO emails (sequence_id, lead_id, touch_number, subject, body, status)
             VALUES ($1, $2, $3, $4, $5, 'drafted')`,
            [seqId, lead.id, e.touch_number, e.subject, e.body]
          );
        }

        if (draft.linkedin_message?.trim()) {
          await client.query(
            `INSERT INTO linkedin_messages (sequence_id, lead_id, message, status)
             VALUES ($1, $2, $3, 'drafted')`,
            [seqId, lead.id, draft.linkedin_message]
          );
        }

        await client.query(`UPDATE leads SET status = 'drafted', updated_at = NOW() WHERE id = $1`, [lead.id]);
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }

      drafted++;
      console.log(`[${drafted + errors}/${leads.length}] drafted lead ${lead.id} (${lead.company_name})`);
    } catch (err) {
      errors++;
      console.error(`[${drafted + errors}/${leads.length}] FAILED lead ${lead.id} (${lead.company_name}):`, err instanceof Error ? err.message : err);
    }

    await sleep(delayMs);
  }

  console.log(`\nDone. Drafted: ${drafted}, errors: ${errors}, total: ${leads.length}`);
  await pool.end();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
