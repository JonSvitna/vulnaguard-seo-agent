# Design: GitHub Token, SEO Push Reliability, and Site Switcher Fixes

**Date:** 2026-06-10  
**Status:** Approved  

---

## Problem Summary

Three user-reported issues, all confirmed in code review:

1. **GitHub token not accepted** — Token is stored in Vercel env vars but the app should run on Railway. Railway cannot see Vercel env vars. Additionally, the Settings UI appears to save tokens but only copies them to clipboard; nothing entered there ever reaches the server.
2. **SEO tasks not pushed to site repo** — Push failures are caught silently (`catch { /* continue */ }`), so users see "Pushed 0/1 files" with no error message. Root cause is the token issue above.
3. **Site dropdown sends incorrect site context** — `clearSession()` is called synchronously after `setActiveSite()`. Because React state updates are asynchronous, `activeSite` inside `clearSession`'s closure still references the previous site. The welcome message and module prompts use the stale value.

Bonus issue found: `sentinel-cmmc` was added to the `SITES` array but never added to the AI system prompt, causing incorrect agent responses for that site.

---

## Solution: Client-Side Token Storage with Header Passthrough

### Token Flow

1. **Settings page** stores each key in `localStorage` on explicit Save. On page load, inputs are pre-populated from `localStorage`. The existing "Copy as .env" action is kept as a secondary button.
2. **Dashboard** reads `GITHUB_TOKEN`, `ANTHROPIC_API_KEY`, and `OPENAI_API_KEY` from `localStorage` at request time and passes them as HTTP headers:
   - `X-GitHub-Token` → `/api/github`
   - `X-AI-Key` + `X-AI-Provider` → `/api/agent`
3. **API routes** read the header first; if absent, fall back to `process.env.*`. This means Railway env vars work out of the box for any user who hasn't touched the Settings UI.

Security note: tokens are stored in `localStorage` (client-only, same-origin) and sent over HTTPS to the app's own API routes. No third-party exposure.

### Bug Fixes

**Stale closure in site switcher**  
Replace `clearSession()` (which closes over `activeSite`) with `clearSessionForSite(site: SiteConfig)` that receives the new site as a parameter. The dropdown `onChange` handler passes the newly looked-up site object directly, so the welcome message and all module prompts always reference the correct site.

**Silent push failures**  
Remove the empty `catch` block in `deployFiles`. Collect error messages per file and display them in the deploy banner alongside the success count (e.g., "Pushed 1/2 files. Error: 401 Bad credentials").

**Sentinel CMMC missing from system prompt**  
Add `sentinel-cmmc.vercel.app` to the SITES list in `SEO_SYSTEM_PROMPT` in `lib/config.ts`. Extend the M1 module prompt topic ternary in the dashboard to explicitly handle `sentinel-cmmc` with topic "CMMC compliance for defense contractors."

---

## Files Changed

| File | Change |
|---|---|
| `lib/config.ts` | Add sentinel-cmmc to `SEO_SYSTEM_PROMPT` sites list |
| `lib/github.ts` | Accept optional `token` parameter in `getOctokit()` |
| `app/api/github/route.ts` | Read `X-GitHub-Token` header, pass to `getOctokit()` |
| `app/api/agent/route.ts` | Read `X-AI-Key` header, use in place of env var when present |
| `app/settings/page.tsx` | Real localStorage save/load; keep clipboard copy as secondary |
| `app/dashboard/page.tsx` | Read localStorage for headers; fix stale closure; surface push errors |

---

## Success Criteria

- Entering a GitHub token in Settings and clicking Save → subsequent pushes succeed without restarting the server or editing `.env.local`
- Railway `GITHUB_TOKEN` env var works as fallback with no UI action required
- Switching sites in the dropdown → welcome message and first module prompt reference the newly selected site
- A failed GitHub push shows a specific error message in the deploy banner
- Running M1 for Sentinel CMMC produces CMMC-relevant output (not "Baltimore real estate")

---

## Out of Scope

- Server-side persistent config storage
- Multi-user token management
- Vercel env var write-back API
