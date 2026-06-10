This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

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
| `ANTHROPIC_API_KEY` | Yes* | Powers the SEO agent using Claude models. |
| `OPENAI_API_KEY` | Yes* | Alternative provider — powers the agent using GPT-4o. Switch providers with the dashboard's provider selector. |
| `GITHUB_TOKEN` | Yes | Personal access token (`repo` scope) for reading/writing site files. |
| `PEXELS_API_KEY` | No | Used by M6 to source blog post images. |
| `GSC_CLIENT_ID` / `GSC_CLIENT_SECRET` / `GSC_REFRESH_TOKEN` | No | OAuth credentials for Google Search Console ranking data (M2). |
| `DATABASE_URL` | Yes (on Railway) | Postgres connection string used for session + result persistence. Auto-injected when you attach Railway's Postgres plugin. |
| `PGSSLMODE` | No | Set to `disable` only for local non-SSL Postgres. Railway-managed Postgres requires SSL (default). |

## Deploy on Railway

1. Create a new Railway project from this repo. Nixpacks picks up `railway.json` — `npm ci && npm run build` for build, `npm run start` for runtime (binds to `$PORT`).
2. Add the **Postgres** plugin. Railway injects `DATABASE_URL` automatically; the schema (sessions, messages, results, inventory) is created on first request.
3. Set `ANTHROPIC_API_KEY` and/or `OPENAI_API_KEY`, plus `GITHUB_TOKEN`, in the service's Variables tab.
4. Railway redeploys on push. Sessions and pending file outputs survive deploys because they live in Postgres, not the container filesystem.

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
