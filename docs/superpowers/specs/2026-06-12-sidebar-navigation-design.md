# Sidebar Navigation & Page Transitions — Design Spec

**Date:** 2026-06-12  
**Status:** Approved  

## Problem

All inter-page navigation uses raw `<a href>` anchor tags, which force a full browser reload on every route change. There is no persistent site-wide navigation — each page has its own isolated header. Users must hit the browser back button to leave any page, and all in-page state (scroll position, open panels, selected leads) is lost on every transition.

## Goals

1. Persistent left sidebar visible on all app pages — navigate freely without the back button.
2. Client-side routing — no full-page reloads.
3. Smooth visual transitions between pages.
4. State preservation — navigating away and back restores the page as left.

## Non-Goals

- URL-encoded state for individual page sub-views (deferred to a later iteration).
- Mobile / responsive sidebar (not currently required).
- Adding new pages or changing any page's business logic.

---

## Architecture

### Route Group Layout

Create an `(app)` route group that wraps all four app pages under a single shared layout. Next.js route groups (parenthesised folder names) do not affect URL paths.

```
app/
  layout.tsx                    ← unchanged: html/body shell
  page.tsx                      ← unchanged: redirect / → /dashboard
  globals.css                   ← add ~15 lines of view transition CSS
  (app)/
    layout.tsx                  ← NEW: sidebar + <main> slot
    dashboard/
      page.tsx                  ← moved (no code changes)
      marketing-agents/
        page.tsx                ← moved (no code changes)
    content-pipeline/
      page.tsx                  ← moved (no code changes)
    settings/
      page.tsx                  ← moved (no code changes)
  api/                          ← unchanged
```

`app/page.tsx` (the `/` redirect) remains outside the route group; it resolves before the `(app)` layout applies.

### Next.js Config Additions

In `next.config.ts`, enable two experimental flags:

```ts
const nextConfig: NextConfig = {
  experimental: {
    viewTransition: true,   // React ViewTransition API for page crossfades
    cacheComponents: true,  // React Activity: preserve page state across navigation
  },
}
```

`cacheComponents` keeps up to 3 routes in the DOM (`display: none`) when you navigate away. Scroll positions, form inputs, open rows, and component state are all preserved automatically when returning to a page.

---

## Shared App Layout (`app/(app)/layout.tsx`)

A server component. Renders the sidebar and the `{children}` main content area side-by-side.

### Structure

```
<div class="flex h-screen overflow-hidden bg-[#0D0F14]">
  <Sidebar />          ← sticky, full height, never unmounts
  <main>               ← flex-1, overflow-y-auto, view transition target
    <ViewTransition>
      {children}
    </ViewTransition>
  </main>
</div>
```

The `<main>` element gets `style={{ viewTransitionName: 'page-content' }}` so the View Transitions API animates only the content area; the sidebar stays locked in place.

### Sidebar Component (`app/(app)/_components/Sidebar.tsx`)

A `"use client"` component (needs `usePathname` to highlight the active route).

**Visual spec:**
- Root element: `style={{ viewTransitionName: 'sidebar' }}` — pins it in place during page transitions
- Width: `w-52` (208px), full height, `bg-[#0D0F14]`, `border-r border-white/[0.07]`
- Top: brand mark — `⬡` hex icon (gold gradient) + "VULNAGUARD" wordmark + "SEO Agent" subtitle, matching existing page header style
- Nav items below, with `Link` from `next/link`

**Nav items:**

| Emoji | Label | `href` |
|---|---|---|
| ⬡ | Agent | `/dashboard` |
| 📣 | Marketing | `/dashboard/marketing-agents` |
| ✦ | Content | `/content-pipeline` |
| ⚙ | Settings | `/settings` |

**Active state:** left border `border-l-2 border-[#C9A84C]`, text `text-white`  
**Inactive state:** `text-gray-400`, hover `text-white transition-colors`

---

## Per-Page Header Changes

Each page currently embeds brand logo + navigation links in its own `<header>`. After the sidebar exists, those elements are redundant. Remove:

### Dashboard (`app/(app)/dashboard/page.tsx`)
**Remove:** `⬡` logo block, "Marketing Agents" `<a>`, "Content Pipeline" `<a>`, "⚙ Settings" `<a>`  
**Keep:** site selector `<select>`, AI provider `<select>`, status dot `<div>`

### Marketing Agents (`app/(app)/dashboard/marketing-agents/page.tsx`)
**Remove:** `V` logo block + "VULNAGUARD / Marketing Agent Team" title block  
**Keep:** LLM provider toggle (Claude/OpenAI buttons), tier `<select>`, status dot

### Settings (`app/(app)/settings/page.tsx`)
**Remove:** `⬡` logo block, "← Back to Agent" `<a>`  
**Keep:** the `<header>` element, showing just the "Agent Settings" subtitle text on the right side as a page label

### Content Pipeline (`app/(app)/content-pipeline/page.tsx`)
No top-level header exists — no changes needed.

---

## Navigation Link Replacements

All internal `<a href>` navigation links are replaced with `<Link href>` from `next/link`. This enables client-side routing immediately. Affected occurrences:

| File | Old | New |
|---|---|---|
| `dashboard/page.tsx` | `<a href="/dashboard/marketing-agents">` | `<Link href="/dashboard/marketing-agents">` |
| `dashboard/page.tsx` | `<a href="/content-pipeline">` | `<Link href="/content-pipeline">` |
| `dashboard/page.tsx` | `<a href="/settings">` | `<Link href="/settings">` |
| `settings/page.tsx` | `<a href="/dashboard">` | removed (sidebar replaces) |

---

## View Transitions CSS

Added to `app/globals.css`. Crossfades the `page-content` view transition name. Suppresses sidebar animation. Respects `prefers-reduced-motion`.

```css
/* Page content crossfade */
::view-transition-old(page-content) {
  animation: 150ms ease-in both fade reverse;
}
::view-transition-new(page-content) {
  animation: 200ms ease-out 100ms both fade,
             200ms ease-out 100ms both slide-up;
}

/* Sidebar stays locked */
::view-transition-group(sidebar) {
  animation: none;
  z-index: 100;
}
::view-transition-old(sidebar),
::view-transition-new(sidebar) {
  animation: none;
}

@keyframes fade {
  from { opacity: 0; filter: blur(2px); }
  to   { opacity: 1; filter: blur(0); }
}
@keyframes slide-up {
  from { translate: 0 8px; }
  to   { translate: 0 0; }
}

@media (prefers-reduced-motion: reduce) {
  ::view-transition-old(*),
  ::view-transition-new(*),
  ::view-transition-group(*) {
    animation-duration: 0s !important;
    animation-delay: 0s !important;
  }
}
```

---

## Implementation Steps (ordered)

1. Enable `viewTransition` and `cacheComponents` in `next.config.ts`
2. Create `app/(app)/` directory and move the four page directories into it
3. Create `app/(app)/_components/Sidebar.tsx`
4. Create `app/(app)/layout.tsx` with sidebar + ViewTransition-wrapped `<main>`
5. Strip logo/nav elements from Dashboard, Marketing Agents, and Settings headers
6. Add view transition CSS to `globals.css`
7. Verify dev server: navigate all four pages, confirm no reloads, sidebar persists, transitions animate

## Success Criteria

- Navigating between any two pages does not trigger a full page reload (no white flash, network tab shows no full document request)
- The sidebar is visible and shows correct active highlight on all four pages
- Navigating away from Marketing Agents and returning restores the page state (lead list, scroll position)
- `prefers-reduced-motion` disables all animations
- No TypeScript/lint errors introduced
