<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Vulnaguard Outreach — Codebase Guide

## Mandatory Workflow Rules

**Before any creative work** (new features, components, behavior changes): run the **brainstorming skill** (`.claude/skills/brainstorming/SKILL.md`). Do NOT skip to implementation. Hard gate — no code until user approves a design.

**When writing, editing, or reviewing code**: apply the **karpathy-guidelines skill** (`.claude/skills/karpathy-guidelines/SKILL.md`). Surface assumptions, keep changes surgical, simplify ruthlessly.

## Build & Run

```bash
npm run dev      # Next.js dev server (port 3000)
npm run build    # Production build
npm run lint     # ESLint
```

Test suite: plain Node.js `node:test` (`npm run test`), colocated `.test.mjs` files. Also validate via TypeScript (`tsc --noEmit`) and lint.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16.2.9 (App Router), React 19 |
| Language | TypeScript 5 |
| Styling | Tailwind CSS v4 (PostCSS plugin — NOT `tailwind.config.js`) |
| Database | PostgreSQL via `pg` — pool in `lib/db.ts`, versioned SQL migrations in `lib/db/migrations/` run via `lib/db/migrate.ts` |
| AI | Anthropic Claude (`@anthropic-ai/sdk`) — lead qualifier + email copywriter |
| Email | Resend (`lib/email.ts`), Microsoft Graph mailbox polling for reply/STOP detection (`lib/ms365-graph.ts`) |
| Deploy | Railway (see `railway.json`, `nixpacks.toml`) |

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string (required — Railway plugin) |
| `ANTHROPIC_API_KEY` | Claude API key (primary AI provider) |
| `OPENAI_API_KEY` | GPT-4o fallback (optional) |
| `RESEND_API_KEY` | Sends outreach email |
| `PGSSLMODE` | Set to `disable` for local/Railway internal connections |

## Directory Map

```
app/
  (app)/              # Authenticated app shell (Sidebar layout)
    dashboard/marketing-agents/  # Lead pipeline UI (leads, drafts, approval)
    dashboard/activity/          # Pipeline run history
    settings/
  api/
    agents/[name]/run   # Generic agent runner (POST body → agent output)
    marketing/          # Leads, sequences, approvals, send queue
    health/db/          # DB connectivity check (used by Settings)
    settings/ai-provider/
lib/
  db.ts               # PostgreSQL pool + ensureSchema() (runs migrations)
  db/
    migrations/       # Numbered .sql files — additive, IF NOT EXISTS only
    migrate.ts        # runMigrations() — applies unapplied files in schema_migrations order
  domain/status.ts    # Shared lead/draft/email/job status enums
  send-batch.ts       # Core sending worker (atomic claim + Resend send)
  marketing/          # batch-approval.ts, draft-leads.ts — transactional, tested
  agents/
    registry.ts       # AGENT_REGISTRY — add new agents here
    runAgent.ts       # Runs agent + logs to agent_runs table
vulnaguard-marketing-agents/
  agents/
    scout/            # Lead extractor from raw text
    outreach/         # Lead qualifier + email copywriter
```

## Key Conventions

**API routes** use `NextRequest`/`NextResponse`. Dynamic params are `Promise<{ param: string }>` — always `await params`.

**Database** — use the `query<T>()` helper from `lib/db.ts`. Schema changes go in a new numbered file under `lib/db/migrations/`, never edited into old ones — pure additive `IF NOT EXISTS` DDL, no drops/renames of live data without an explicit migration for it.

**Agent system** — add new agents to `AGENT_REGISTRY` in `lib/agents/registry.ts`. All agents log runs to `agent_runs` table automatically via `runAgent.ts`.

**Tailwind v4** — uses `@import "tailwindcss"` in CSS, not `@tailwind base/components/utilities`. No `tailwind.config.js` — config is in `postcss.config.mjs`.

**View Transitions** — enabled via `experimental.viewTransition` in `next.config.ts`. Use `viewTransitionName` style prop and `<ViewTransition>` from React.

**AI response parsing** — agents return JSON wrapped in markdown fences. Strip ` ```json ``` ` before `JSON.parse`. Pattern used in all agent files.

## Design Docs

All specs live in [`docs/superpowers/specs/`](docs/superpowers/specs/) — reference before modifying established subsystems. Plans in [`docs/superpowers/plans/`](docs/superpowers/plans/).
