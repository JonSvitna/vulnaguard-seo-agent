<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Vulnaguard SEO Agent — Codebase Guide

## Mandatory Workflow Rules

**Before any creative work** (new features, components, behavior changes): run the **brainstorming skill** (`.claude/skills/brainstorming/SKILL.md`). Do NOT skip to implementation. Hard gate — no code until user approves a design.

**When writing, editing, or reviewing code**: apply the **karpathy-guidelines skill** (`.claude/skills/karpathy-guidelines/SKILL.md`). Surface assumptions, keep changes surgical, simplify ruthlessly.

## Build & Run

```bash
npm run dev      # Next.js dev server (port 3000)
npm run build    # Production build
npm run lint     # ESLint
```

No test suite configured. Validate via TypeScript (`tsc --noEmit`) and lint.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16.2.9 (App Router), React 19 |
| Language | TypeScript 5 |
| Styling | Tailwind CSS v4 (PostCSS plugin — NOT `tailwind.config.js`) |
| Database | PostgreSQL via `pg` — pool in `lib/db.ts`, schema auto-inits on first request |
| AI | Anthropic Claude Sonnet 4.6 (`@anthropic-ai/sdk`) — all agents use this model |
| GitHub | Octokit (`@octokit/rest`) — writes files to external site repos |
| Deploy | Railway (see `railway.json`, `nixpacks.toml`) |

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string (required — Railway plugin) |
| `ANTHROPIC_API_KEY` | Claude API key (primary AI provider) |
| `OPENAI_API_KEY` | GPT-4o fallback (optional) |
| `GITHUB_TOKEN` | Writes pages to managed site repos |
| `PGSSLMODE` | Set to `disable` for local/Railway internal connections |

## Directory Map

```
app/
  (app)/              # Authenticated app shell (Sidebar layout)
    dashboard/        # SEO Agent chat UI (M1–M6 modules)
    dashboard/marketing-agents/  # Lead pipeline UI
    content-pipeline/ # Multi-platform content generator
    settings/
  api/
    agent/            # Main streaming SEO chat endpoint
    agents/[name]/run # Generic agent runner (POST body → agent output)
    sessions/         # CRUD for SEO session history
    github/           # File write proxy to external repos
    marketing/        # Leads, sequences, approvals, send queue
    content-pipeline/ # Content generation + script endpoints
    gsc/              # Google Search Console proxy
    pexels/           # Stock image search
lib/
  config.ts           # SITES array + SEO_SYSTEM_PROMPT (the SEO agent brain)
  db.ts               # PostgreSQL pool + schema (all tables defined here)
  github.ts           # Octokit helpers (read/write/batch commit)
  agents/
    registry.ts       # AGENT_REGISTRY — add new agents here
    runAgent.ts       # Runs agent + logs to agent_runs table
vulnaguard-marketing-agents/
  agents/
    scout/            # Lead extractor from raw text
    outreach/         # Lead qualifier + email copywriter
    content-pipeline/ # Multi-brand social content generator
  pipeline/           # DB persistence layer for content pipeline
components/
  content-pipeline/   # CaptureScreen, GeneratingScreen, Dashboard UI
```

## Key Conventions

**API routes** use `NextRequest`/`NextResponse`. Dynamic params are `Promise<{ param: string }>` — always `await params`.

**Database** — use the `query<T>()` helper from `lib/db.ts`. Schema lives entirely in `lib/db.ts` (`SCHEMA` const). New tables go there.

**Agent system** — add new agents to `AGENT_REGISTRY` in `lib/agents/registry.ts`. All agents log runs to `agent_runs` table automatically via `runAgent.ts`.

**Sites** — multi-tenant. All API calls accept `siteId`. Managed sites: `vulnaguard`, `sentinel-cmmc`, `mectofitness`, `bluealamo`. Config in `lib/config.ts`.

**SEO modules** — M1 Research → M2 Monitor → M3 Audit → M4 Execute → M5 Page Factory → M6 Images. Phase markers (`<!-- PHASE:xxx:READY -->`) drive UI auto-advancement.

**GitHub file writes** — always output complete files, never diffs. Blog posts → `app/blog/[slug]/page.tsx`, service pages → `app/[slug]/page.tsx` in target repos.

**Tailwind v4** — uses `@import "tailwindcss"` in CSS, not `@tailwind base/components/utilities`. No `tailwind.config.js` — config is in `postcss.config.mjs`.

**View Transitions** — enabled via `experimental.viewTransition` in `next.config.ts`. Use `viewTransitionName` style prop and `<ViewTransition>` from React.

**AI response parsing** — agents return JSON wrapped in markdown fences. Strip ` ```json ``` ` before `JSON.parse`. Pattern used in all agent files.

## Design Docs

All specs live in [`docs/superpowers/specs/`](docs/superpowers/specs/) — reference before modifying established subsystems. Plans in [`docs/superpowers/plans/`](docs/superpowers/plans/).
