# Vulnaguard Lead Outreach

Email-only lead outreach. Import leads → qualify (leads without an email address are
parked in `no_email` and never scored) → draft a multi-touch email sequence → **Approve**
to send. Approving schedules touch 1 for immediate send, schedules the follow-up drip
touches, and fires the send batch right away — there is no separate "release" step.
Follow-up touches are sent automatically by the background scheduler in
`instrumentation.ts`.

The former SEO agent, content pipeline, and video-brief tooling have been removed; this
app now does one thing: qualify email-bearing leads and send outreach.

This is a [Next.js](https://nextjs.org) project.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Environment Variables

Set these via `.env.local` or your deployment platform's environment settings (also editable from the in-app **Settings** page):

| Variable | Required | Description |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | Yes* | Powers the lead qualifier and email copywriter (Claude models). |
| `OPENAI_API_KEY` | Yes* | Alternative provider — GPT models. Switch providers per agent on the Settings page. |
| `RESEND_API_KEY` | Yes | Sends outreach email via Resend. Without it, sends fail. |
| `DATABASE_URL` | Yes (on Railway) | Postgres connection string for leads/sequences/send history. Auto-injected when you attach Railway's Postgres plugin. |
| `SEND_BATCH_INTERVAL_MINUTES` | No | How often the background scheduler sends due drip touches (default 15). |
| `DISABLE_SEND_BATCH_SCHEDULER` | No | Set to `true` to turn off the background send/drip scheduler. |
| `PGSSLMODE` | No | Set to `disable` only for local non-SSL Postgres. Railway-managed Postgres requires SSL (default). |

Slack (`lib/slack.ts`) and Microsoft Graph (`lib/ms365-graph.ts`, for STOP-reply detection) use their own env vars where configured.

## Deploy on Railway

1. Create a new Railway project from this repo. Nixpacks picks up `railway.json` — `npm ci && npm run build` for build, `npm run start` for runtime (binds to `$PORT`).
2. Add the **Postgres** plugin. Railway injects `DATABASE_URL` automatically; the marketing schema (leads, sequences, emails, personas) is created on first request.
3. Set `ANTHROPIC_API_KEY` and/or `OPENAI_API_KEY`, plus `RESEND_API_KEY`, in the service's Variables tab.
4. Railway redeploys on push. Leads, drafts, and send history survive deploys because they live in Postgres, not the container filesystem.

### Persistence layer

- `sessions` — one row per dashboard conversation, keyed by `site_id`. The dashboard auto-loads the most recent session for the active site on mount.
- `messages` — append-only chat history per session (`role`, `content`).
- `results` — agent file outputs (`kind = 'file'` for parsed file blocks, `kind = 'deploy'` once pushed to GitHub).
- `inventory` — per-site blog / service counts, updated whenever the agent reports them.

\* At least one of `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` must be set. The dashboard's provider selector chooses which one is used per request.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
