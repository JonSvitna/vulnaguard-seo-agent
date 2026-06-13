# Configuration Guide

This app is configured two ways:

1. **Environment variables** — server-side credentials (Anthropic, database, etc.). Set these in `.env.local` for local dev, or in your deploy platform's Variables tab (Railway) for production.
2. **In-app Settings page** (`/settings`) — browser-stored keys (GitHub, Pexels, GSC, and a personal Anthropic/OpenAI key) used by the SEO agent dashboard. These are saved in `localStorage` and sent with each request — handy for trying the agent without touching server config, but they don't persist across browsers/devices.
3. **Marketing Agents config** (`/dashboard/marketing-agents` → Settings tab) — a few operational settings (qualification threshold, send delays, etc.) stored in the database, not env vars.

If both an env var and an in-app/browser key exist for the same provider, the per-request browser key wins for the SEO agent dashboard; server env vars are the fallback and are what the Marketing Agents and Content Pipeline routes always use.

---

## 1. Core / Required

| Variable | Where to set | Required? |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | `.env.local` / Railway / Settings page | Yes* |
| `OPENAI_API_KEY` | `.env.local` / Railway / Settings page | Yes* (alternative to Anthropic) |
| `DATABASE_URL` | Railway (auto-injected by Postgres plugin) | Yes — needed for sessions, marketing agents, content pipeline |
| `PGSSLMODE` | `.env.local` only | No — set to `disable` for local non-SSL Postgres |

\* At least one of `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` is required. **The Marketing Agents (Qualifier, Copywriter, Scout) and Content Pipeline agents always use `ANTHROPIC_API_KEY` server-side** — they don't read the browser-stored key, so this must be set as a real environment variable (not just pasted into `/settings`).

### Get an Anthropic API key
1. Go to [console.anthropic.com/keys](https://console.anthropic.com/keys)
2. Create a key, copy it (starts with `sk-ant-`)
3. Local: add `ANTHROPIC_API_KEY=sk-ant-...` to `.env.local`
4. Production: Railway → your service → **Variables** → add `ANTHROPIC_API_KEY`

### Get an OpenAI API key (optional)
1. Go to [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Create a key, copy it (starts with `sk-`)
3. Same placement as above (`OPENAI_API_KEY`)

### Database (Postgres)
1. In Railway, add the **Postgres** plugin to your project
2. Railway injects `DATABASE_URL` into your service automatically — no manual setup
3. Schema (sessions, leads, sequences, emails, content pipeline, etc.) is created automatically on first request via `ensureSchema()` in `lib/db.ts`
4. For local dev against a local Postgres without SSL, set `PGSSLMODE=disable` in `.env.local`

---

## 2. SEO Agent Dashboard (`/dashboard`)

These power the main SEO agent (research, audits, page generation, GitHub deploys). Set via `/settings` in the browser, or as env vars to give every browser a default.

| Variable | Required? | Used for |
| --- | --- | --- |
| `GITHUB_TOKEN` | Yes | Reading/writing site files via the GitHub API |
| `PEXELS_API_KEY` | No | M6 — sourcing blog post images |
| `GSC_CLIENT_ID` / `GSC_CLIENT_SECRET` / `GSC_REFRESH_TOKEN` | No | M2 — Google Search Console ranking data |

### GitHub token
1. Go to [github.com/settings/tokens](https://github.com/settings/tokens) → **Generate new token (classic)**
2. Scope: `repo` (full control of private repositories)
3. Set an expiration (1 year is reasonable)
4. Copy the token (`ghp_...`)
5. Paste into `/settings` → "GitHub Personal Access Token", click **Save Keys** — or set `GITHUB_TOKEN` as an env var

### Pexels (optional)
1. Go to [pexels.com/api](https://www.pexels.com/api/), sign up, copy your API key
2. Paste into `/settings` or set `PEXELS_API_KEY`

### Google Search Console (optional)
1. Go to [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials), create/select a project
2. Enable the **Search Console API**
3. Create an **OAuth 2.0 Client ID** (**Web application** type) — add `https://developers.google.com/oauthplayground` as an authorized redirect URI
4. Copy the Client ID and Client Secret
5. Go to [developers.google.com/oauthplayground](https://developers.google.com/oauthplayground) → gear icon (top right) → check "Use your own OAuth credentials" → paste your Client ID and Secret
6. In the left panel, find **Webmaster Tools v2** (the Search Console API's legacy listing in the Playground) and select its readonly scope — or skip the search and paste `https://www.googleapis.com/auth/webmasters.readonly` directly into "Input your own scopes" at the bottom — then click **Authorize APIs** and sign in with the Google account that has access to your GSC property
7. Click **Exchange authorization code for tokens** and copy the **Refresh token**
8. Paste Client ID, Client Secret, and Refresh Token into `/settings` (or set `GSC_CLIENT_ID` / `GSC_CLIENT_SECRET` / `GSC_REFRESH_TOKEN`)

Note: refresh tokens from the OAuth Playground don't expire unless revoked, but Google may invalidate them after ~6 months of inactivity or if your OAuth consent screen is in "Testing" mode (limit ~7 days) — publish the consent screen (even without verification, for internal/low-use) to avoid that.

### Which sites the agent manages
The list of managed sites (domain, GitHub repo, Vercel project ID) is hardcoded in `lib/config.ts` (`SITES` array) — edit that file to add/remove sites, not an env var.

---

## 3. Content Pipeline (`/content-pipeline`)

Uses `ANTHROPIC_API_KEY` only (server-side) — no additional configuration. The Video tab generates a speaking script rather than a rendered video (HyperFrames rendering isn't wired up); see `CONTENT_PIPELINE.md` for details.

---

## 4. Marketing Agents (`/dashboard/marketing-agents`)

Uses `ANTHROPIC_API_KEY` only (server-side) for the Qualifier, Copywriter, and Scout (bulk-import) agents — no additional credentials required for the current feature set.

### Operational settings (Settings tab, stored in DB)
These live in the `agent_config` table and are edited from the dashboard's **Settings** tab (no env vars):

| Setting | Default | Purpose |
| --- | --- | --- |
| LLM Provider / Tier | `claude` / `balanced` | Header toggle — informational, both currently map to Claude calls |
| Min Qualification Score | `6` | Threshold (0-10) above which the Qualifier marks a lead `qualified` vs `disqualified` |
| Sequence Delay Days | `4,9` | Days after approval that touch 2 / touch 3 become due in the Send Queue |
| Daily Send Limit | `50` | Reserved for future automated sending |
| Approval Batch Size | `10` | Reserved for future automated runs |
| SMTP Host / Sender Email | empty | Reserved — see below |

### Not yet wired (future credentials)
The dashboard's Settings tab lists these as placeholders for future automation — setting them currently has no effect because no code reads them yet:

| Variable | Would enable |
| --- | --- |
| `APIFY_API_KEY` | A scraping step feeding the Scout's `extractLeads` (currently paste-text-only bulk import works without this) |
| `SMTP_PASSWORD` (+ `smtp_host`/`smtp_from` above) | Automated sending from the Send Queue (currently: copy-to-clipboard + manual send + "Mark Sent") |

If you want to wire either of these up, add the env var (`.env.local` / Railway Variables) and let me know — both have a clear integration point already designed (see `docs/superpowers/specs/` for the Scout and Sender design docs).

---

## 5. Quick checklist

**Local dev (`.env.local`):**
```
ANTHROPIC_API_KEY=sk-ant-...
DATABASE_URL=postgres://...        # or run against Railway's DB
GITHUB_TOKEN=ghp_...
PEXELS_API_KEY=...                  # optional
GSC_CLIENT_ID=...                   # optional
GSC_CLIENT_SECRET=...               # optional
GSC_REFRESH_TOKEN=...               # optional
PGSSLMODE=disable                   # only if local Postgres has no SSL
```

**Railway (Variables tab):**
- `ANTHROPIC_API_KEY` (required — powers Marketing Agents + Content Pipeline + SEO agent default)
- `DATABASE_URL` (auto-injected by Postgres plugin)
- `GITHUB_TOKEN`, `PEXELS_API_KEY`, `GSC_*` (optional — or leave to per-browser `/settings`)

**In-browser (`/settings`):** GitHub token, Pexels, GSC OAuth, and a personal Anthropic/OpenAI key for the SEO agent dashboard — useful for quick testing without redeploying.
