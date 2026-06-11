# Persistent Session History — Design Spec

## Problem

On the deployed (Railway) app, the dashboard always starts fresh — the welcome
message only, no restored chat, no prior scan results — even though a Postgres
plugin is attached and `DATABASE_URL` is set on the web service. This forces
re-running scans (M1–M6) repeatedly to see results that were already generated.

Locally (against a local Postgres), persistence works as expected, so this is a
production-only issue.

## Root cause

`lib/db.ts`'s `buildPool()` only disables SSL when `PGSSLMODE=disable` is set or
the connection string targets `localhost`/`127.0.0.1`. Railway's internal
Postgres hostname (`*.railway.internal`) does not support SSL on the private
network, but the pool still attempts an SSL handshake (`{ rejectUnauthorized:
false }`), causing every `pool.query()` call to throw.

All call sites that depend on this (`/api/sessions` GET/POST, `persistMessage`,
results posts, phase updates) are wrapped in `catch { /* best-effort */ }` in
[app/dashboard/page.tsx](../../../app/dashboard/page.tsx), so the failures are
completely silent — the dashboard just behaves as if no sessions ever existed.

Separately, even once persistence works, there is currently **no UI** to browse
or switch between multiple past sessions for a site — only the single
most-recently-updated (or last-used) session auto-loads.

## Scope

1. Fix the DB connection SSL detection so queries succeed against Railway's
   internal Postgres connection string.
2. Replace silent persistence failures with a visible error state, plus a
   `/api/health/db` diagnostic endpoint surfaced on the Settings page.
3. Add a "Past Scans" session history panel: list, switch between, and delete
   prior sessions per site.

## 1. DB connection fix (`lib/db.ts`)

`buildPool()`'s SSL decision currently is:

```ts
const ssl =
  process.env.PGSSLMODE === 'disable' || /\blocalhost\b|127\.0\.0\.1/.test(connectionString)
    ? false
    : { rejectUnauthorized: false }
```

Extend the regex to also match Railway's internal hostname pattern
(`*.railway.internal`), which does not support SSL on the private network:

```ts
const ssl =
  process.env.PGSSLMODE === 'disable' ||
  /\blocalhost\b|127\.0\.0\.1|\.railway\.internal\b/.test(connectionString)
    ? false
    : { rejectUnauthorized: false }
```

No new environment variables required. Public/proxy Postgres connection
strings (used for local dev against a Railway DB, e.g. `*.proxy.rlwy.net`)
continue to use SSL as before.

## 2. Persistence error visibility

### `/api/health/db` endpoint

New route `app/api/health/db/route.ts`:

- `GET` runs `SELECT 1` via `ensureSchema()` + `getPool().query(...)`.
- Returns `{ ok: true }` on success, or `{ ok: false, error: <message> }`
  (500) on failure.
- Used by the Settings page to show a "Database: connected / error" status
  line, so DB issues are diagnosable from the UI without Railway log access.

### Dashboard error banner

In [app/dashboard/page.tsx](../../../app/dashboard/page.tsx), add a
`persistenceError` state (`string | null`). The following call sites currently
swallow errors via empty `catch` blocks and will instead set
`persistenceError` with a short message on failure, and clear it on success:

- Initial session load (`GET /api/sessions`, `GET /api/sessions/:id`)
- `ensureSession` (`POST /api/sessions`)
- `persistMessage` (`POST /api/sessions/:id/messages`)
- Results posts (`POST /api/sessions/:id/results`)
- Phase update (`POST /api/sessions/:id/phase`)

When `persistenceError` is set, show a dismissible banner (same visual
treatment as the existing deploy-status banner) reading something like:
*"Session persistence unavailable — your work won't be saved. (`<error
detail>`)"*. The banner is dismissible per-occurrence but reappears if a
subsequent persistence call fails again. The app continues to function in
degraded (non-persistent) mode — this is visibility, not a hard blocker.

## 3. Session history panel

### Data

Reuses the existing `GET /api/sessions?siteId=...` (returns up to 50 sessions
ordered by `updated_at DESC`, including `id`, `title`, `phase`/`phase_status`
via the `[id]` detail route, `created_at`, `updated_at`) and
`DELETE /api/sessions/:id`.

### Auto-titling

`sessions.title` is currently always `null` — nothing sets it. In
`POST /api/sessions/[id]/messages` ([app/api/sessions/[id]/messages/route.ts](../../../app/api/sessions/[id]/messages/route.ts)),
when persisting a `role: 'user'` message, if the session's `title` is still
`null`, update it to the first ~60 characters of that message (trimmed, with
`…` if truncated). This gives each session a meaningful label in the history
list with no extra API calls from the client.

### UI

New "Past Scans" section in the sidebar of
[app/dashboard/page.tsx](../../../app/dashboard/page.tsx), placed below the
existing "Prior Results" block:

- Lists sessions for `activeSite.id` from `GET /api/sessions?siteId=...`.
- Each row shows: title (or "Untitled session" fallback), relative time
  (e.g. "2h ago"), and a small phase badge if `phase`/`phase_status` is set
  (e.g. "M3 · ready").
- The currently-loaded session is highlighted.
- Clicking a row calls a new `loadSession(id)` function (see below) to
  restore that session's messages/results/phase into the UI.
- Each row has a small "×" delete button. Clicking it calls
  `DELETE /api/sessions/:id` after a confirm step; if the deleted session was
  the active one, falls back to the next most recent session (or a fresh
  session if none remain).

### Refactor: `loadSession(id)`

The session-restoration logic currently inline in the site-switch `useEffect`
([app/dashboard/page.tsx:126-197](../../../app/dashboard/page.tsx#L126-L197))
— fetching `GET /api/sessions/:id`, computing `recoveredFiles`, setting
`messages`/`recentResults`/`phaseState`/`sessionId` — is extracted into a
`loadSession(id: string)` callback. The site-switch effect's "pick the best
session for this site" logic (preferred-from-localStorage, else most recent
with messages/results) calls `loadSession` once it has chosen an id. The new
history panel calls `loadSession` directly with the user-selected id, and
updates the per-site `localStorage` "preferred session" key to that id so it
remains the default on next load.

## Testing

Because the root-cause bug only reproduces against Railway's Postgres, manual
verification after deploy:

1. `/api/health/db` reports `{ ok: true }`.
2. Run a module (e.g. M1) on a site, reload the page — chat history and phase
   state restore.
3. Run scans across 2-3 different sessions (e.g. via "Clear session" between
   runs), confirm the "Past Scans" panel lists all of them with sensible
   auto-generated titles.
4. Click between sessions in the panel and confirm messages/results/phase
   switch correctly.
5. Delete a session from the panel and confirm it disappears from the list and
   (if it was active) falls back gracefully.
6. Temporarily break `DATABASE_URL` (or simulate a query error) and confirm
   the persistence-error banner appears with a useful message, and the app
   remains usable in degraded mode.

## Out of scope

- The Marketing Agents ("Outreach") dashboard backend — tracked as a separate
  design.
- Cross-site session search/listing (history panel is scoped to the active
  site, matching existing `GET /api/sessions?siteId=` usage).
- Editing session titles manually (auto-generated from first message only).
