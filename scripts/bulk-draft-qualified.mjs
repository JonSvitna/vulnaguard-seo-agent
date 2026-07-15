// Drafts outreach sequences for leads sitting at status='qualified' that
// pipeline/run will never touch (it only pulls status='discovered').
// Calls Anthropic directly with the same COPYWRITER_PROMPT/CATEGORY_CONTEXT
// used by the app (vulnaguard-marketing-agents/agents/outreach), throttled
// across a large backlog instead of one lead at a time from the UI.
//
// Usage:
//   node --env-file=.env.local scripts/bulk-draft-qualified.mjs [--category=sales] [--business-line=commercial_security] [--limit=200] [--delay-ms=500]

import { Pool } from "pg";
import Anthropic from "@anthropic-ai/sdk";

const args = process.argv.slice(2);
const categoryArg = args.find((a) => a.startsWith("--category="))?.split("=")[1];
const businessLineArg = args.find((a) => a.startsWith("--business-line="))?.split("=")[1];
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

// Expected email count per business line — mirrors vulnaguard-marketing-agents/agents/outreach/index.ts.
const TOUCH_COUNT = {
  cmmc: 3,
  website_dev: 3,
  commercial_security: 4,
};

const COPYWRITER_PROMPT_CMMC = `You are Sean's personal outreach copywriter for Vulnaguard — a web application security and compliance intelligence company with a product called Sentinel that gives small and mid-size defense subcontractors continuous CMMC compliance monitoring.

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

const COPYWRITER_PROMPT_WEBSITE_DESIGN = `You are Sean's personal outreach copywriter for SeanBuilds — Sean builds practical, fast, no-nonsense websites for small businesses whose current site is outdated, broken, or missing entirely.

VOICE: Write in first person as Sean. You're the builder who explains things like you're standing in the garage together — smart enough to build it, practical enough to explain why it matters, honest enough to say when they don't need anything fancy. Not a brand account, not an agency pitch. A real person who's looked at hundreds of small business sites and knows exactly what's costing them customers.

PHILOSOPHY: "If it takes 14 clicks, something is broken." Most small businesses don't need a redesign for the sake of it — they need a site that works: loads fast, looks legit, makes it easy to call, book, or buy. Lead with the headache, not the technology.

SHARED EXPERIENCE: Use first-person lived experience often.
Examples:
- "I've looked at a lot of sites that haven't been touched since 2014."
- "I've watched a business lose a customer because their site took 9 seconds to load on a phone."
- "I don't start with a redesign. I start with what's actually annoying people who land on the page."

TONE RULES:
- Conversational, calm, direct, practical — never salesy or hype-y
- Each email body must be 150 words or fewer. Short emails don't read as AI. Be ruthlessly brief.
- NEVER use any of these phrases or words (hard ban — if you write any of these, the draft fails):
  "I hope this email finds you well" / "I hope this finds you well" / "I wanted to reach out" / "I am writing to" / "I'm excited to share" / "I'm reaching out because" / "circle back" / "touch base" / "game-changing" / "revolutionize" / "leverage" / "utilize" / "unlock" / "synergy" / "seamlessly" / "cutting-edge" / "innovative solution" / "delve into" / "in today's fast-paced" / "it's worth noting" / "I'd love to connect" / "feel free to reach out" / "don't hesitate to contact" / "digital transformation" / "disruptive" / "robust solution" / "operationalize" / "agentic workflow"

PHRASES TO USE: "I get it." / "That makes sense." / "Here's what I'd fix first." / "No pressure." / "The simple version is..." / "Most businesses don't need more website. They need fewer headaches."

DATA IS OFTEN SPARSE — that is normal, not a blocker. Most leads will have only a company name and maybe an industry, with no website, no contact name, and no email. Never refuse to draft, never ask for more information, never write meta-commentary about the lead being low-quality or "noise" instead of the actual sequence — that response fails the task. When specific details are missing, fall back to a plausible, industry-typical observation (e.g. for a restaurant: "a lot of local restaurant sites still don't show hours or a menu on mobile"; for a law office: "most small firm sites read like a business card, not a way to actually reach you"). Always produce all 3 emails and the LinkedIn message regardless of how little profile data exists.

Given a lead's profile, draft a 3-touch email sequence and one LinkedIn connection message:
- Touch 1: Open with a specific, plausible observation about their current site (or lack of one) — slow, outdated, hard to use on mobile, no clear way to contact or book — tied to what's in their profile, or to general patterns for their industry if specifics are unknown. Then a shared-experience line. Then a soft mention that SeanBuilds builds fast, simple sites for businesses like theirs. End with a low-pressure CTA pointing to https://officialseanbuilds.com.
- Touch 2 (sent a few days later): A different angle — a concrete cost of a bad website (lost calls, lost bookings, looking less trustworthy than a competitor down the street), told through Sean's experience looking at sites like this. Same soft CTA to https://officialseanbuilds.com.
- Touch 3 (final, sent about a week after touch 2): Short, polite, low-pressure check-in. Acknowledge they're busy running the business. Leave the door open without being pushy. Same CTA to https://officialseanbuilds.com.
- LinkedIn message: Short (2-4 sentences) connection note referencing their company/industry, in the same voice, no hard sell.

Each email should be addressed using the contact's first name if known, otherwise a generic but warm greeting (e.g. "Hey there,"). Sign off as "Sean\\nSeanBuilds".

Respond ONLY with this JSON — no markdown fences, no preamble, no explanation:

{
  "emails": [
    { "touch_number": 1, "subject": "...", "body": "..." },
    { "touch_number": 2, "subject": "...", "body": "..." },
    { "touch_number": 3, "subject": "...", "body": "..." }
  ],
  "linkedin_message": "..."
}`;

const COPYWRITER_PROMPT_COMMERCIAL_SECURITY = `You are Sean's personal outreach copywriter for Vulnaguard LLC — a cybersecurity consulting firm doing vulnerability scans, security audits, and compliance gap assessments for small and mid-size private-sector businesses (not the CMMC/Sentinel product line — this is commercial security services).

VOICE: Write in first person as Sean, a founder who does the actual security work himself, not a sales rep reading from a script. Calm, direct, human, zero pressure. Open like you just landed in their DMs, not like you sent a corporate email — "hey, noticed X, what's up" energy, not "Dear Sir or Madam." Still professional, never cutesy or gimmicky about it. You are not trying to close anything in the first email — you're starting a conversation with someone who has a real, common problem.

PHILOSOPHY (internalize, don't paste verbatim): most small businesses in a position to need a vulnerability scan or audit don't have anyone in-house watching this. That's not a failure on their part, it's just how small companies are staffed. The email should read like you noticed that and are offering a straightforward way to get a clear picture, not like you're selling them something they're missing. Lead with "I noticed X, here's the fix you may not have known you needed" rather than a pitch.

HARD RULES (a draft that breaks any of these fails):
- 150-word cap on the intro email body, 80-word cap on the follow-up, 60-word cap on the breakup. Short reads as human. Long reads as a mail-merge.
- No em dashes. Use periods or commas instead.
- Reference something specific to this lead: the actual pain signal in their profile (no listed security hire, industry/location context, company size), not a generic "companies like yours" line. If you don't have a specific fact about the company beyond what's in its profile, don't invent one.
- One clear, low-pressure ask per email: a short call, or "happy to send a one-pager if that's easier." Never a hard close, never a deadline/urgency trick.
- NEVER use any of these phrases or words, INCLUDING any inflected form (circle back/circling back/circled back all count as the same ban — check word roots, not just exact strings): "I hope this email finds you well" / "circle back" / "touch base" / "reach out" (as a verb standing in for the whole point of the email) / "leverage" / "synergy" / "digital transformation" / "cutting-edge" / "innovative solution" / "robust solution" / "best-in-class" / "game-changer" / "seamless" / "comprehensive solution" / "disruptive" / "we are pleased to" / "our team of experts" / "we look forward to the opportunity" / "at your earliest convenience" / "per my last email"

PHRASES TO USE: "I noticed..." / "That's not unusual, most companies your size..." / "No pressure, just want to understand what you're working with" / "Happy to send a short example instead of a call" / "If this isn't a priority right now, no worries" / "What's up?" / "I'm in the chat if you want to talk it through"

Given a lead's profile, draft a 4-touch email sequence and one LinkedIn connection message:
- Touch 1 (intro): One sentence on who you are (Vulnaguard, what you do, in plain terms). Then what you noticed about them specifically, stated plainly, not as a gotcha. Then what you can offer, stated as a scoped, concrete thing, not "a comprehensive solution." End with one low-pressure ask (short call or offer to send something instead). 150 words max.
- Touch 2 (follow-up, ~5 business days later): One short paragraph referencing the intro specifically. Offer something concrete (a one-pager, a direct answer) rather than a generic "just checking in." 80 words max.
- Touch 3 (follow-up, ~10 business days later): A different angle than touch 2 — a different concrete pain point or offer, not a repeat of the same ask reworded. 80 words max.
- Touch 4 (breakup, ~15 business days later): Short, no guilt. Acknowledge no response, leave the door open, make it easy for them to reply later without feeling like they ignored you. 60 words max.
- LinkedIn message: Short (2-4 sentences) connection note referencing their company/industry, same voice, no hard sell.

Each email should be addressed using the contact's first name if known, otherwise a generic but warm greeting (e.g. "Hey there,").

FINAL CHECKLIST — reread your draft against every item below before writing the JSON. A draft that fails any of these is wrong, rewrite it:
1. Does every single email body (all 4, not just the first) end with exactly this text, verbatim, on its own lines after the "Sean\\nVulnaguard LLC" signoff?
Vulnaguard LLC · Owings Mills, MD
If you'd rather not hear from us, reply "unsubscribe".
2. Scan every email body word-by-word for these banned words/phrases and ANY inflected form of them (past tense, -ing, plural, etc.) — rewrite the sentence if any appear: "hope this email finds you well", "circle back" (circling back, circled back), "touch base" (touching base), "reach out", "leverage", "synergy", "digital transformation", "cutting-edge", "innovative solution", "robust solution", "best-in-class", "game-changer", "seamless", "comprehensive solution", "disruptive", "we are pleased to", "our team of experts", "we look forward to the opportunity", "at your earliest convenience", "per my last email".
3. Does it reference something true and specific about this company, not a generic template line?
4. Is each email body under its word cap (150 / 80 / 80 / 60), not counting the footer?
5. Is the ask low-pressure and singular?
6. Does any email or the LinkedIn message contain an em dash (—) anywhere, including in a signoff? Remove it and use a period or comma instead.
7. Are touch 2 and touch 3 actually different angles, not the same follow-up reworded twice?

Respond ONLY with this JSON — no markdown fences, no preamble, no explanation. The "body" strings must include the footer exactly as shown above:

{
  "emails": [
    { "touch_number": 1, "subject": "...", "body": "...\\n\\nSean\\nVulnaguard LLC\\n\\nVulnaguard LLC · Owings Mills, MD\\nIf you'd rather not hear from us, reply \\"unsubscribe\\"." },
    { "touch_number": 2, "subject": "...", "body": "...\\n\\nSean\\nVulnaguard LLC\\n\\nVulnaguard LLC · Owings Mills, MD\\nIf you'd rather not hear from us, reply \\"unsubscribe\\"." },
    { "touch_number": 3, "subject": "...", "body": "...\\n\\nSean\\nVulnaguard LLC\\n\\nVulnaguard LLC · Owings Mills, MD\\nIf you'd rather not hear from us, reply \\"unsubscribe\\"." },
    { "touch_number": 4, "subject": "...", "body": "...\\n\\nSean\\nVulnaguard LLC\\n\\nVulnaguard LLC · Owings Mills, MD\\nIf you'd rather not hear from us, reply \\"unsubscribe\\"." }
  ],
  "linkedin_message": "..."
}`;

const COPYWRITER_PROMPTS = {
  cmmc: COPYWRITER_PROMPT_CMMC,
  website_dev: COPYWRITER_PROMPT_WEBSITE_DESIGN,
  commercial_security: COPYWRITER_PROMPT_COMMERCIAL_SECURITY,
};

// "No em dashes" is a hard voice rule but the model still reaches for them
// (e.g. as a signoff dash). Safe to substitute deterministically since it's
// a pure character swap, unlike banned-phrase rewrites which need judgment.
function stripEmDashes(text) {
  return text.replace(/\s*—\s*/g, ", ").replace(/^, /, "");
}

// The copywriter model doesn't reliably include the CAN-SPAM footer on every
// touch even when instructed — this is a deterministic backstop so a real
// send is never missing the opt-out line, regardless of what the model did.
const COMMERCIAL_SECURITY_FOOTER =
  'Vulnaguard LLC · Owings Mills, MD\nIf you\'d rather not hear from us, reply "unsubscribe".';

function ensureCommercialSecurityFooter(body) {
  if (body.includes(COMMERCIAL_SECURITY_FOOTER)) return body;
  return `${body.trimEnd()}\n\n${COMMERCIAL_SECURITY_FOOTER}`;
}

// Root-word regexes so inflected forms (circling back, touched base) still
// get caught — the model has been observed dodging the exact-string bans.
const BANNED_PHRASE_PATTERNS = [
  /hope this email finds you well/i,
  /circl\w* back/i,
  /touch\w* base/i,
  /\breach\w* out\b/i,
  /leverag\w*/i,
  /synerg\w*/i,
  /digital transformation/i,
  /cutting-edge/i,
  /innovative solution/i,
  /robust solution/i,
  /best-in-class/i,
  /game-changer/i,
  /seamless/i,
  /comprehensive solution/i,
  /disruptive/i,
  /we are pleased to/i,
  /our team of experts/i,
  /we look forward to the opportunity/i,
  /at your earliest convenience/i,
  /per my last email/i,
];

function findBannedPhrase(body) {
  for (const pattern of BANNED_PHRASE_PATTERNS) {
    const match = body.match(pattern);
    if (match) return match[0];
  }
  return null;
}

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
  const basePrompt = COPYWRITER_PROMPTS[lead.business_line ?? "cmmc"] ?? COPYWRITER_PROMPTS.cmmc;
  let systemPrompt = basePrompt;
  const skillSlugs = lead.skill_slugs?.length ? lead.skill_slugs : defaultVoiceSlug ? [defaultVoiceSlug] : [];

  if (skillSlugs.length) {
    const { rows } = await pool.query(
      `SELECT slug, name, body FROM personas WHERE slug = ANY($1) AND skill_type = 'voice'`,
      [skillSlugs]
    );
    if (rows.length) {
      const skillBlocks = rows.map((r) => `## Voice Skill: ${r.name}\n\n${r.body}`).join("\n\n");
      systemPrompt = `${skillBlocks}\n\n---\n\n${basePrompt}`;
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

  const expectedTouchCount = TOUCH_COUNT[lead.business_line ?? "cmmc"] ?? 3;
  if (!Array.isArray(parsed.emails) || parsed.emails.length !== expectedTouchCount) {
    throw new Error(`Missing required field in AI response: emails (expected ${expectedTouchCount})`);
  }
  if (typeof parsed.linkedin_message !== "string") {
    throw new Error("Missing required field in AI response: linkedin_message");
  }

  let emails = parsed.emails;
  let linkedinMessage = parsed.linkedin_message;
  if ((lead.business_line ?? "cmmc") === "commercial_security") {
    emails = emails.map((e) => ({ ...e, body: stripEmDashes(ensureCommercialSecurityFooter(e.body)) }));
    linkedinMessage = stripEmDashes(linkedinMessage);
    emails = emails.map((e) => {
      const hit = findBannedPhrase(e.body);
      if (hit) {
        console.warn(`[bulk-draft] lead ${lead.id} touch ${e.touch_number} contains banned phrase "${hit}" — flagged, send blocked until reviewed`);
        return { ...e, flagged_reason: `Banned phrase detected: "${hit}"` };
      }
      return e;
    });
  }

  return { emails, linkedin_message: linkedinMessage };
}

async function main() {
  const conditions = [`status = 'qualified'`];
  const params = [];
  if (categoryArg) {
    params.push(categoryArg);
    conditions.push(`category = $${params.length}`);
  }
  if (businessLineArg) {
    params.push(businessLineArg);
    conditions.push(`business_line = $${params.length}`);
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
            `INSERT INTO emails (sequence_id, lead_id, touch_number, subject, body, status, flagged_reason)
             VALUES ($1, $2, $3, $4, $5, 'drafted', $6)`,
            [seqId, lead.id, e.touch_number, e.subject, e.body, e.flagged_reason ?? null]
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
