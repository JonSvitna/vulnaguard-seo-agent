import { Pool } from "pg";
import { query } from "@/lib/db";

interface SentContact {
  company_name: string;
  domain: string | null;
  contact_email: string | null;
  sent_at: string;
}

interface LeadLike {
  id: number;
  company_name: string;
  website?: string | null;
  contact_email?: string | null;
}

let externalPool: Pool | undefined;

function getExternalPool(): Pool | null {
  const url = process.env.AI_MARKETING_DATABASE_URL;
  if (!url) return null;
  if (!externalPool) {
    externalPool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, max: 3 });
  }
  return externalPool;
}

const CACHE_TTL_MS = 10 * 60 * 1000;
let cache: { at: number; contacts: SentContact[] } | null = null;

async function getSentContacts(): Promise<SentContact[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.contacts;

  const pool = getExternalPool();
  if (!pool) return [];

  const res = await pool.query<SentContact>(`
    SELECT l.company_name, l.domain, l.contact_email, om.sent_at
    FROM outreach_messages om
    JOIN leads l ON l.id = om.lead_id
    WHERE om.status = 'sent'
  `);
  cache = { at: Date.now(), contacts: res.rows };
  return res.rows;
}

function normName(s: string | null | undefined): string | null {
  return s ? s.trim().toLowerCase().replace(/[^a-z0-9]/g, "") : null;
}
function normEmail(s: string | null | undefined): string | null {
  return s ? s.trim().toLowerCase() : null;
}
function normDomain(s: string | null | undefined): string | null {
  if (!s) return null;
  return s.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
}

/**
 * Cross-references newly inserted leads against Ai-Marketing's already-sent
 * outreach history. Matches by exact email, then domain, then normalized
 * company name. Any match gets the lead marked 'rejected' in this app's DB
 * so the send pipeline (which only pulls status='discovered') skips it.
 * Returns the set of lead ids that were rejected.
 */
export async function rejectAlreadyContactedLeads<T extends LeadLike>(leads: T[]): Promise<Set<number>> {
  const rejectedIds = new Set<number>();
  if (!leads.length) return rejectedIds;

  let sentContacts: SentContact[];
  try {
    sentContacts = await getSentContacts();
  } catch (err) {
    console.error("[external-dedup] failed to fetch Ai-Marketing sent contacts, skipping check", err);
    return rejectedIds;
  }
  if (!sentContacts.length) return rejectedIds;

  const byEmail = new Map<string, SentContact>();
  const byDomain = new Map<string, SentContact>();
  const byName = new Map<string, SentContact>();
  for (const c of sentContacts) {
    const e = normEmail(c.contact_email);
    if (e) byEmail.set(e, c);
    const d = normDomain(c.domain);
    if (d) byDomain.set(d, c);
    const n = normName(c.company_name);
    if (n) byName.set(n, c);
  }

  for (const lead of leads) {
    const email = normEmail(lead.contact_email);
    const domain = normDomain(lead.website);
    const name = normName(lead.company_name);

    const match =
      (email && byEmail.get(email)) ||
      (domain && byDomain.get(domain)) ||
      (name && byName.get(name));

    if (match) {
      const sentDate = new Date(match.sent_at).toISOString().slice(0, 10);
      await query(
        `UPDATE leads SET status = 'rejected', score_reason = $1, updated_at = NOW() WHERE id = $2`,
        [`Already contacted via Ai-Marketing outreach on ${sentDate}`, lead.id]
      );
      rejectedIds.add(lead.id);
    }
  }

  return rejectedIds;
}
