# Dashboard UX Follow-ups — Design

## Context

Three usability issues with `/dashboard` after a Full SEO Pass / multi-module session:

1. The chat pane auto-scrolls to the bottom on every streamed token, making it impossible to scroll up and read earlier output while a response is generating.
2. Long module responses (M1/M5/M6 especially, now up to 16k tokens) stack up as full-height bubbles with no way to condense them for an overview.
3. There's no way to export a session's findings/changes.
4. "Past Scans" in the sidebar already lists prior sessions, but every entry shows as "Untitled session", and clicking "Clear session" doesn't survive a page reload — the app falls back to auto-resuming the most recent session for that site, making it feel like clearing "didn't work" or that the app "remembers work was completed prior."

All changes are confined to [app/(app)/dashboard/page.tsx](app/(app)/dashboard/page.tsx); item 5 also passes an optional `title` through the existing `POST /api/sessions` (no new endpoints).

## Fixes

### 1. Smart auto-scroll
Replace the unconditional scroll effect at [page.tsx:102](app/(app)/dashboard/page.tsx#L102):

- Add `stickToBottomRef = useRef(true)`.
- Add an `onScroll` handler on the scrollable message container: `stickToBottomRef.current = (scrollHeight - scrollTop - clientHeight) < 80`.
- Change the effect to: `useEffect(() => { if (stickToBottomRef.current) bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])`.
- At the start of `streamAgent` (when the user's own message is appended), force `stickToBottomRef.current = true` so sending a message or starting a module always scrolls to show the new response.

### 2. Collapsible message bubbles
- New state: `const [collapsedMessages, setCollapsedMessages] = useState<Set<number>>(new Set())`.
- In `streamAgent`, when appending the new assistant placeholder message, add the index of the **previous** assistant message (if any) to `collapsedMessages` — it auto-collapses as the next module starts.
- `toggleCollapse(i)` flips membership in the set; wire to a click handler on each bubble's header.
- Rendering: if `collapsedMessages.has(i)`, render a compact one-line header — the message's first markdown heading line if present, else the first ~60 chars + "…" — with a ▸/▾ indicator. User messages (`role === 'user'`) are never auto-collapsed and always render in full (they're short).
- On session restore (`applySessionDetail`), initialize `collapsedMessages` to contain every assistant message index except the last, so reopened sessions are readable immediately.
- On `clearSession`, reset `collapsedMessages` to empty.

### 3. Export session
- New `exportSession()` function and an "Export" button in the sidebar next to "Clear session" (disabled when `messages.length === 0`).
- Builds a single Markdown string:
  - Header: site domain, ISO timestamp, session id.
  - "Findings & Changes" section: one line per `recentResults` entry (`- **{kind}**: {path}`).
  - "Transcript" section: each message as `### User` / `### Agent` followed by its content.
- Triggers a client-side download via `Blob` + temporary `<a download="...">` — no server round trip.

### 4. "Clear session" persists across reload
- `clearSession()` (sidebar button, called with no args → defaults to `activeSite`) writes the sentinel value `'none'` to `localStorage[getSessionStorageKey(activeSite.id)]` instead of removing the key. Also resets `collapsedMessages`.
- In the session-restore effect ([page.tsx:242-297](app/(app)/dashboard/page.tsx#L242-L297)): if `preferredId === 'none'`, skip the resume entirely — still `setSessionList(sessions)` so "Past Scans" stays populated, but leave the UI in the blank "ready" state (same as the existing no-session-found branch).
- Manually loading a past session via `loadSession(id)` (clicking an entry in "Past Scans") calls `applySessionDetail`, which already writes the real session id to localStorage — this naturally overrides the `'none'` sentinel.
- The site-switcher's call to `clearSession(site)` is unaffected — it's a separate code path keyed off the *target* site and keeps removing the key as today (out of scope for this fix).

### 5. Auto-generated session titles
- `streamAgent(userMessage: string, titleHint?: string)` gains an optional second parameter, forwarded to `ensureSession(titleHint)`.
- `ensureSession` includes `title: titleHint ?? null` in the `POST /api/sessions` body when creating a new session (titles are set once at creation; existing sessions are unchanged).
- Call sites supply hints:
  - Full SEO Pass button → `"Full SEO Pass"`.
  - `handleModule(moduleId)` → `` `${MODULES[moduleId-1].code}: ${MODULES[moduleId-1].label}` `` (e.g. `"M3: On-Page Auditor"`).
  - `handleSend()` (free-typed prompt) → first 57 chars of the input + "…" if longer, else the input as-is.
- "Past Scans" list ([page.tsx:750](app/(app)/dashboard/page.tsx#L750)) already renders `s.title || 'Untitled session'` — no rendering change needed, just populated titles going forward. Sessions created before this change keep showing "Untitled session".

## Testing Plan

1. `npm run build` passes.
2. Run a Full SEO Pass: confirm earlier module bubbles auto-collapse as each new module starts, scrolling up during a stream doesn't get yanked back down, and sending a new prompt does scroll to it.
3. Click a collapsed bubble to expand it and back.
4. Click "Export" → downloaded `.md` contains findings list + full transcript.
5. Run a module, click "Clear session", reload the page → blank "ready" state persists (no auto-resume); "Past Scans" still lists the cleared session, and clicking it restores it.
6. Run M1/M2/Full SEO Pass and check "Past Scans" shows descriptive titles instead of "Untitled session" for newly created sessions.
