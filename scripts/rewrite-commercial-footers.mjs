// Rewrite unsent commercial-security email bodies that still have the old
// pipe STOP footer. Only touches leads with a non-empty contact_email.
//
// Usage:
//   node --env-file=.env.local scripts/rewrite-commercial-footers.mjs
//   node --env-file=.env.local scripts/rewrite-commercial-footers.mjs --apply

import { Pool } from "pg";

const apply = process.argv.includes("--apply");

const OLD_COMMERCIAL_SECURITY_FOOTER =
  "Sean Murrill | Vulnaguard LLC | 980 Joshua Tree Ct, Owings Mills, MD 21117 | Reply STOP to opt out.";

const COMMERCIAL_SECURITY_FOOTER =
  'Vulnaguard LLC · Owings Mills, MD\nIf you\'d rather not hear from us, reply "unsubscribe".';

function ensureCommercialSecurityFooter(body) {
  if (body.includes(COMMERCIAL_SECURITY_FOOTER)) return body;
  return `${body.trimEnd()}\n\n${COMMERCIAL_SECURITY_FOOTER}`;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function rewriteCommercialFooterBody(body) {
  if (!body.includes(OLD_COMMERCIAL_SECURITY_FOOTER)) return null;
  const oldBlock = new RegExp(
    `(?:\\n*---\\n*)?${escapeRegExp(OLD_COMMERCIAL_SECURITY_FOOTER)}`,
    "g"
  );
  const next = body.replace(oldBlock, "").trimEnd();
  return ensureCommercialSecurityFooter(next);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: /\blocalhost\b|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "")
    ? false
    : { rejectUnauthorized: false },
  max: 3,
});

const rows = await pool.query(
  `SELECT e.id, e.body, e.status, l.id AS lead_id, l.company_name, l.contact_email
   FROM emails e
   JOIN leads l ON l.id = e.lead_id
   WHERE l.business_line = 'commercial_security'
     AND NULLIF(TRIM(l.contact_email), '') IS NOT NULL
     AND e.status IN ('drafted', 'sending')
     AND e.body LIKE '%' || $1 || '%'`,
  [OLD_COMMERCIAL_SECURITY_FOOTER]
);

console.log(`candidates: ${rows.rowCount} (apply=${apply})`);

let updated = 0;
let skipped = 0;
for (const row of rows.rows) {
  const next = rewriteCommercialFooterBody(row.body ?? "");
  if (!next) {
    skipped++;
    continue;
  }
  console.log(`#${row.id} ${row.company_name} <${row.contact_email}> status=${row.status}`);
  if (apply) {
    await pool.query(`UPDATE emails SET body = $2 WHERE id = $1`, [row.id, next]);
    updated++;
  }
}

console.log(`updated=${updated} would_update=${apply ? updated : rows.rowCount - skipped} skipped=${skipped}`);
await pool.end();
