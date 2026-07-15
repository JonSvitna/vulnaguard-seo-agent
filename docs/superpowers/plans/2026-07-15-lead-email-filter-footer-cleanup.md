# Lead Email Filter + Commercial Footer Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let operators filter Leads + Approval to emailable contacts, and replace the spammy commercial-security footer (new drafts + rewrite of email-contact unsent drafts).

**Architecture:** Client-side contact chips on the Leads tab (all leads already loaded). Approval Queue stays server-paginated, so it gets a small `has_email` query param on the existing pending API (same pattern as `business_line`). Soft legal footer string lives in the copywriter prompt + `ensureCommercialSecurityFooter` backstop; a one-shot Node script rewrites matching DB rows.

**Tech Stack:** Next.js App Router, React client page, PostgreSQL via `pg`, Node 20+ (`node --test`, `node --env-file=.env.local`).

**Spec:** `docs/superpowers/specs/2026-07-15-lead-email-filter-footer-cleanup-design.md`

**Spec note / justified deviation:** Spec non-goal said “no API `has_email` param.” Approval is server-paginated (`page`/`limit`); client-only filtering of the current page would lie about totals and miss matches on other pages. This plan adds `has_email` **only** to `GET /api/marketing/approval/pending`. Leads API stays unchanged.

---

## File map

| File | Responsibility |
|---|---|
| `lib/marketing/commercial-footer.ts` | Shared old/new footer strings + `ensureCommercialSecurityFooter` + `rewriteCommercialFooterBody` |
| `lib/marketing/commercial-footer.test.mjs` | Node built-in tests for rewrite/ensure |
| `vulnaguard-marketing-agents/agents/outreach/index.ts` | Import shared ensure helper for commercial drafts |
| `vulnaguard-marketing-agents/agents/outreach/systemPrompts.ts` | Soft footer in commercial copywriter prompt |
| `scripts/bulk-draft-qualified.mjs` | Mirror soft footer (script does not import TS app code) |
| `scripts/rewrite-commercial-footers.mjs` | Dry-run / `--apply` DB rewrite for email-contact unsent |
| `app/api/marketing/approval/pending/route.ts` | Optional `has_email=true\|false` SQL filter |
| `app/(app)/dashboard/marketing-agents/page.tsx` | Contact chips on Leads + Approval; wire Approval fetch |

---

### Task 1: Commercial footer helpers + tests (TDD)

**Files:**
- Create: `lib/marketing/commercial-footer.ts`
- Create: `lib/marketing/commercial-footer.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `lib/marketing/commercial-footer.test.mjs`:

```js
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  OLD_COMMERCIAL_SECURITY_FOOTER,
  COMMERCIAL_SECURITY_FOOTER,
  ensureCommercialSecurityFooter,
  rewriteCommercialFooterBody,
} from "./commercial-footer.ts";

describe("ensureCommercialSecurityFooter", () => {
  it("appends soft footer when missing", () => {
    const out = ensureCommercialSecurityFooter("Hi\n\nSean\nVulnaguard LLC");
    assert.ok(out.includes(COMMERCIAL_SECURITY_FOOTER));
    assert.ok(!out.includes(OLD_COMMERCIAL_SECURITY_FOOTER));
  });

  it("is idempotent when soft footer already present", () => {
    const once = ensureCommercialSecurityFooter("Body\n\nSean\nVulnaguard LLC");
    const twice = ensureCommercialSecurityFooter(once);
    assert.equal(once, twice);
  });
});

describe("rewriteCommercialFooterBody", () => {
  it("strips old pipe footer and installs soft footer", () => {
    const body = `Hello\n\nSean\nVulnaguard LLC\n\n---\n${OLD_COMMERCIAL_SECURITY_FOOTER}`;
    const out = rewriteCommercialFooterBody(body);
    assert.ok(!out.includes(OLD_COMMERCIAL_SECURITY_FOOTER));
    assert.ok(out.includes(COMMERCIAL_SECURITY_FOOTER));
    assert.ok(out.includes("Hello"));
  });

  it("returns null when body has no old footer to rewrite", () => {
    assert.equal(rewriteCommercialFooterBody("Hello\n\nSean\nVulnaguard LLC"), null);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd /Users/seanm/Documents/GitHub/vulnaguard-seo-agent
node --experimental-strip-types --test lib/marketing/commercial-footer.test.mjs
```

Expected: FAIL (module not found / exports missing).

- [ ] **Step 3: Write minimal implementation**

Create `lib/marketing/commercial-footer.ts`:

```ts
export const OLD_COMMERCIAL_SECURITY_FOOTER =
  "Sean Murrill | Vulnaguard LLC | 980 Joshua Tree Ct, Owings Mills, MD 21117 | Reply STOP to opt out.";

export const COMMERCIAL_SECURITY_FOOTER =
  'Vulnaguard LLC · Owings Mills, MD\nIf you\'d rather not hear from us, reply "unsubscribe".';

export function ensureCommercialSecurityFooter(body: string): string {
  if (body.includes(COMMERCIAL_SECURITY_FOOTER)) return body;
  return `${body.trimEnd()}\n\n${COMMERCIAL_SECURITY_FOOTER}`;
}

/**
 * Replace legacy pipe STOP footer with soft legal.
 * Returns null if the old footer is not present (caller should skip).
 */
export function rewriteCommercialFooterBody(body: string): string | null {
  if (!body.includes(OLD_COMMERCIAL_SECURITY_FOOTER)) return null;
  let next = body;
  const oldBlock = new RegExp(
    `(?:\\n*---\\n*)?${escapeRegExp(OLD_COMMERCIAL_SECURITY_FOOTER)}`,
    "g"
  );
  next = next.replace(oldBlock, "").trimEnd();
  return ensureCommercialSecurityFooter(next);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
```

Do **not** prepend `---` for the new footer (that separator was part of the spammy look). Soft footer is two lines after a blank line following the signoff.

- [ ] **Step 4: Run tests to verify they pass**

```bash
node --experimental-strip-types --test lib/marketing/commercial-footer.test.mjs
```

Expected: PASS (all 4 tests).

If `--experimental-strip-types` is unavailable on the local Node, convert the helper to `lib/marketing/commercial-footer.mjs` (plain ESM) and import that from both the test and a thin `commercial-footer.ts` re-export — prefer strip-types first since `engines.node` is `>=20.9.0`.

- [ ] **Step 5: Commit**

```bash
git add lib/marketing/commercial-footer.ts lib/marketing/commercial-footer.test.mjs
git commit -m "$(cat <<'EOF'
Add commercial footer helpers with rewrite/ensure tests.

Centralizes soft-legal footer text and old-footer stripping for outreach and backfill.
EOF
)"
```

---

### Task 2: Wire soft footer into copywriter + bulk script

**Files:**
- Modify: `vulnaguard-marketing-agents/agents/outreach/index.ts` (footer const ~223–229, usage ~198)
- Modify: `vulnaguard-marketing-agents/agents/outreach/systemPrompts.ts` (~229–247)
- Modify: `scripts/bulk-draft-qualified.mjs` (~158–199)

- [ ] **Step 1: Update outreach `index.ts` to use shared helper**

Remove local `COMMERCIAL_SECURITY_FOOTER` / `ensureCommercialSecurityFooter`. Import:

```ts
import { ensureCommercialSecurityFooter } from "../../../lib/marketing/commercial-footer";
```

Confirm relative path from `vulnaguard-marketing-agents/agents/outreach/index.ts` to `lib/marketing/commercial-footer.ts` resolves. Keep the existing call site that maps commercial emails through `stripEmDashes(ensureCommercialSecurityFooter(e.body))`.

- [ ] **Step 2: Update commercial prompt checklist + JSON examples**

In `systemPrompts.ts` inside `COPYWRITER_PROMPT_COMMERCIAL_SECURITY`, replace checklist item 1 and the JSON body examples.

Checklist item 1 becomes:

```
1. Does every single email body (all 4, not just the first) end with exactly this text, verbatim, on its own lines after the "Sean\\nVulnaguard LLC" signoff?
Vulnaguard LLC · Owings Mills, MD
If you'd rather not hear from us, reply "unsubscribe".
```

JSON example body suffix becomes:

```
...\\n\\nSean\\nVulnaguard LLC\\n\\nVulnaguard LLC · Owings Mills, MD\\nIf you'd rather not hear from us, reply \\"unsubscribe\\".
```

Remove the `---` and pipe STOP line from all four example bodies.

- [ ] **Step 3: Mirror in `scripts/bulk-draft-qualified.mjs`**

Update the prompt copy (~158–173) the same way as Step 2.

Replace the local footer helpers (~194–199) with:

```js
const COMMERCIAL_SECURITY_FOOTER =
  'Vulnaguard LLC · Owings Mills, MD\nIf you\'d rather not hear from us, reply "unsubscribe".';

function ensureCommercialSecurityFooter(body) {
  if (body.includes(COMMERCIAL_SECURITY_FOOTER)) return body;
  return `${body.trimEnd()}\n\n${COMMERCIAL_SECURITY_FOOTER}`;
}
```

Keep the string identical to `lib/marketing/commercial-footer.ts` — this script stays standalone so it can run without TS imports.

- [ ] **Step 4: Sanity check strings match**

```bash
node --experimental-strip-types -e "
import { COMMERCIAL_SECURITY_FOOTER } from './lib/marketing/commercial-footer.ts';
const script = 'Vulnaguard LLC · Owings Mills, MD\\nIf you\\'d rather not hear from us, reply \"unsubscribe\".';
if (COMMERCIAL_SECURITY_FOOTER !== script) {
  console.error('MISMATCH');
  process.exit(1);
}
console.log('footer strings match');
"
```

Expected: `footer strings match`

- [ ] **Step 5: Commit**

```bash
git add vulnaguard-marketing-agents/agents/outreach/index.ts \
  vulnaguard-marketing-agents/agents/outreach/systemPrompts.ts \
  scripts/bulk-draft-qualified.mjs
git commit -m "$(cat <<'EOF'
Use soft-legal commercial footer in copywriter and bulk draft.

Stops new commercial drafts from appending the pipe STOP blast-mail line.
EOF
)"
```

---

### Task 3: One-shot rewrite script

**Files:**
- Create: `scripts/rewrite-commercial-footers.mjs`

- [ ] **Step 1: Create the script**

```js
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
```

- [ ] **Step 2: Dry-run against DB (read-only)**

```bash
node --env-file=.env.local scripts/rewrite-commercial-footers.mjs
```

Expected: prints `candidates: N` and a per-row log. No DB writes. LinkedIn-only leads must not appear. `sent` rows must not appear.

- [ ] **Step 3: Do NOT run `--apply` yet**

Leave apply for Task 6 after Sean confirms the dry-run count.

- [ ] **Step 4: Commit**

```bash
git add scripts/rewrite-commercial-footers.mjs
git commit -m "$(cat <<'EOF'
Add dry-run/apply script to rewrite commercial email footers.

Targets unsent drafted/sending emails for commercial leads that have contact email.
EOF
)"
```

---

### Task 4: Approval API `has_email` filter

**Files:**
- Modify: `app/api/marketing/approval/pending/route.ts`

- [ ] **Step 1: Add `has_email` query handling**

After reading `search` (~line 37), add:

```ts
const hasEmailParam = req.nextUrl.searchParams.get("has_email");
```

Inside the filter block, after the search filter:

```ts
if (hasEmailParam === "true") {
  filters.push(`NULLIF(TRIM(l.contact_email), '') IS NOT NULL`);
} else if (hasEmailParam === "false") {
  filters.push(`NULLIF(TRIM(l.contact_email), '') IS NULL`);
}
```

No new bind params needed (literal SQL predicates).

- [ ] **Step 2: Manual verify with curl (dev server running)**

```bash
curl -s 'http://localhost:3000/api/marketing/approval/pending?page=1&limit=5&has_email=true'
curl -s 'http://localhost:3000/api/marketing/approval/pending?page=1&limit=5&has_email=false'
```

Expected: `has_email=true` rows all have non-empty `contact_email`; `false` rows are blank/null. If auth middleware blocks curl, verify via dashboard after Task 5.

- [ ] **Step 3: Commit**

```bash
git add app/api/marketing/approval/pending/route.ts
git commit -m "$(cat <<'EOF'
Add has_email filter to approval pending API.

Keeps paginated Approval totals correct when browsing emailable vs LinkedIn-only.
EOF
)"
```

---

### Task 5: Leads + Approval contact chips in the UI

**Files:**
- Modify: `app/(app)/dashboard/marketing-agents/page.tsx`

- [ ] **Step 1: Add shared helper + state**

Near other filter constants (~190), add:

```ts
type ContactFilter = "all" | "has_email" | "no_email";

function leadHasEmail(email: string | null | undefined): boolean {
  return !!(email && email.trim());
}
```

In the main component state block (~883), add:

```ts
const [contactFilter, setContactFilter] = useState<ContactFilter>("all");
const [pendingContactFilter, setPendingContactFilter] = useState<ContactFilter>("all");
```

- [ ] **Step 2: Filter leads client-side**

Update `filteredLeads` (~1429):

```ts
const filteredLeads = leads.filter((lead) => {
  if (leadFilter !== "all" && lead.status !== leadFilter) return false;
  if (categoryFilter !== "all" && lead.category !== categoryFilter) return false;
  if (businessLineFilter !== "all" && lead.business_line !== businessLineFilter) return false;
  if (contactFilter === "has_email" && !leadHasEmail(lead.contact_email)) return false;
  if (contactFilter === "no_email" && leadHasEmail(lead.contact_email)) return false;
  return true;
});
```

- [ ] **Step 3: Wire Approval fetch to API**

Update `fetchPending` (~1103) to include:

```ts
if (pendingContactFilter === "has_email") params.set("has_email", "true");
if (pendingContactFilter === "no_email") params.set("has_email", "false");
```

Add `pendingContactFilter` to the `useCallback` dependency array.

- [ ] **Step 4: Add contact chips to Approval UI**

In the Approval header controls (~1650–1670), after the business-line chips, add All / Has email / No email chips that set `pendingContactFilter` and reset `pendingPage` to 1. Use accent color `#4CA8C9` to distinguish from business-line green.

- [ ] **Step 5: Add contact chips to Leads UI**

After the business-line chip row (~2132–2139), add the same All / Has email / No email chips that set `contactFilter` and reset `leadsPage` to 1.

- [ ] **Step 6: Manual UI verify**

1. Leads → **Has email** → only rows with email; multi-select works on visible page.
2. Leads → **No email** → only blank email / LinkedIn-only.
3. Combine **Has email** + a status chip → AND behavior.
4. Approval → **Has email** → no “No email — LinkedIn only” badges; total count drops vs All.
5. Approval → **No email** → only LinkedIn-only cards.

- [ ] **Step 7: Commit**

```bash
git add "app/(app)/dashboard/marketing-agents/page.tsx"
git commit -m "$(cat <<'EOF'
Add Has email / No email chips on Leads and Approval.

Operators can browse and select emailable contacts before approve/send.
EOF
)"
```

---

### Task 6: Apply footer rewrite + final verification

**Files:** none new (ops)

- [ ] **Step 1: Re-run unit tests**

```bash
node --experimental-strip-types --test lib/marketing/commercial-footer.test.mjs
```

Expected: PASS.

- [ ] **Step 2: Dry-run rewrite, show Sean the count, then apply**

```bash
node --env-file=.env.local scripts/rewrite-commercial-footers.mjs
# after confirming count looks right:
node --env-file=.env.local scripts/rewrite-commercial-footers.mjs --apply
node --env-file=.env.local scripts/rewrite-commercial-footers.mjs
```

Expected after apply: second dry-run `candidates: 0`.

- [ ] **Step 3: Spot-check one commercial draft in Approval UI**

Open an emailable commercial sequence → body ends with soft legal lines, not the pipe STOP address line.

- [ ] **Step 4: Optional doc touch**

If `CONFIGURATION.md` mentions “Reply STOP to opt out” as the required footer text, update that sentence to the soft language. Skip if absent.

- [ ] **Step 5: Final commit only if Step 4 changed a doc**

```bash
git add CONFIGURATION.md
git commit -m "$(cat <<'EOF'
Align config docs with soft-legal commercial footer language.
EOF
)"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|---|---|
| Has email / No email on Leads | Task 5 |
| Has email / No email on Approval | Tasks 4–5 |
| Soft legal for new commercial drafts | Tasks 1–2 |
| Rewrite unsent email-contact drafts only | Task 3 + Task 6 |
| Skip LinkedIn-only + sent | Task 3 SQL |
| Keep STOP/unsubscribe poller | No code change (`unsubscribe` already matched) |
| No CMMC/website signoff changes | Not touched |
| No leads API `has_email` | Honored (Leads client-side) |
| Approval API `has_email` | Task 4 (documented deviation for pagination) |

---

## Self-review notes

- Placeholder scan: none.
- Footer string must stay byte-identical across `commercial-footer.ts`, bulk-draft, and rewrite script.
- New footer intentionally drops `---` separator.
- Do not run `--apply` until Sean confirms dry-run candidates.
