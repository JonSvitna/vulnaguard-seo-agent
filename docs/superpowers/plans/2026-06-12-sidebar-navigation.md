# Sidebar Navigation & Page Transitions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent left sidebar to all app pages, replace anchor-tag navigation with Next.js `Link` for client-side routing, and enable view transitions + state preservation across navigations.

**Architecture:** Create an `(app)` route group with a shared layout wrapping a `Sidebar` component and a `ViewTransition`-wrapped `<main>` content area. Enable `cacheComponents` (page state preserved via React Activity) and `experimental.viewTransition` (crossfade CSS animation) in `next.config.ts`. Existing page code is unchanged except stripping per-page brand logos and nav links now owned by the sidebar.

**Tech Stack:** Next.js 16 App Router, React 19 (`ViewTransition` from `'react'`), Tailwind CSS, `next/link`, `next/navigation` (`usePathname`)

**Spec:** `docs/superpowers/specs/2026-06-12-sidebar-navigation-design.md`

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Modify | `next.config.ts` | Enable `cacheComponents` + `experimental.viewTransition` |
| Create | `app/(app)/_components/Sidebar.tsx` | Persistent nav sidebar with active-route highlight |
| Create | `app/(app)/layout.tsx` | Shared layout: sidebar + ViewTransition-wrapped main |
| Move | `app/dashboard/` → `app/(app)/dashboard/` | No code changes |
| Move | `app/content-pipeline/` → `app/(app)/content-pipeline/` | No code changes |
| Move | `app/settings/` → `app/(app)/settings/` | No code changes |
| Modify | `app/(app)/dashboard/page.tsx` | Fix outer wrapper height; strip logo + nav links from header |
| Modify | `app/(app)/dashboard/marketing-agents/page.tsx` | Fix outer wrapper height; strip logo block from header |
| Modify | `app/(app)/settings/page.tsx` | Simplify header: remove logo + back link |
| Modify | `app/globals.css` | Add view transition keyframes + named-element rules |

---

## Task 1: Enable Next.js config flags

**Files:**
- Modify: `next.config.ts`

- [ ] **Step 1: Update next.config.ts**

Replace the entire file with:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  experimental: {
    viewTransition: true,
  },
};

export default nextConfig;
```

- [ ] **Step 2: Verify dev server starts without error**

```bash
npm run dev
```

Expected: server starts, no config warnings about unknown keys, `localhost:3000` loads the dashboard.

- [ ] **Step 3: Commit**

```bash
git add next.config.ts
git commit -m "feat: enable cacheComponents and viewTransition"
```

---

## Task 2: Create Sidebar component

**Files:**
- Create: `app/(app)/_components/Sidebar.tsx`

- [ ] **Step 1: Create directory and file**

```bash
mkdir -p app/\(app\)/_components
```

Create `app/(app)/_components/Sidebar.tsx` with this content:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/dashboard", icon: "⬡", label: "Agent" },
  { href: "/dashboard/marketing-agents", icon: "📣", label: "Marketing" },
  { href: "/content-pipeline", icon: "✦", label: "Content" },
  { href: "/settings", icon: "⚙", label: "Settings" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="flex flex-col w-52 h-screen bg-[#0D0F14] border-r border-white/[0.07] shrink-0"
      style={{ viewTransitionName: "sidebar" }}
    >
      <div className="flex items-center gap-3 px-4 py-4 border-b border-white/[0.07]">
        <div className="w-8 h-8 rounded-md bg-gradient-to-br from-[#C9A84C] to-[#8B6914] flex items-center justify-center text-sm font-bold text-black">
          ⬡
        </div>
        <div>
          <div className="text-sm font-bold tracking-wide text-white">VULNAGUARD</div>
          <div className="text-[10px] text-[#C9A84C] tracking-[0.15em] uppercase">SEO Agent</div>
        </div>
      </div>

      <nav className="flex flex-col gap-1 p-3 flex-1">
        {NAV.map(({ href, icon, label }) => {
          const active =
            pathname === href ||
            (href !== "/dashboard" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                active
                  ? "border-l-2 border-[#C9A84C] text-white bg-white/[0.04] pl-[10px]"
                  : "text-gray-400 hover:text-white hover:bg-white/[0.03]"
              }`}
            >
              <span className="text-base leading-none">{icon}</span>
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add "app/(app)/_components/Sidebar.tsx"
git commit -m "feat: add Sidebar component"
```

---

## Task 3: Create shared app layout

**Files:**
- Create: `app/(app)/layout.tsx`

- [ ] **Step 1: Create `app/(app)/layout.tsx`**

```tsx
import { ViewTransition } from "react";
import { Sidebar } from "./_components/Sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-[#0D0F14]">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <ViewTransition name="page-content">{children}</ViewTransition>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add "app/(app)/layout.tsx"
git commit -m "feat: add (app) shared layout with sidebar slot"
```

---

## Task 4: Move pages into the (app) route group

**Files:**
- Move: `app/dashboard/` → `app/(app)/dashboard/`
- Move: `app/content-pipeline/` → `app/(app)/content-pipeline/`
- Move: `app/settings/` → `app/(app)/settings/`

The `app/api/` directory stays in place — API routes do not use the app layout.

- [ ] **Step 1: Move the three page directories**

```bash
cd app
mv dashboard "(app)/dashboard"
mv content-pipeline "(app)/content-pipeline"
mv settings "(app)/settings"
```

- [ ] **Step 2: Verify all four routes load with sidebar**

Start (or restart) the dev server:

```bash
npm run dev
```

Visit each route and confirm the sidebar is visible on all of them:
- `http://localhost:3000/dashboard`
- `http://localhost:3000/dashboard/marketing-agents`
- `http://localhost:3000/content-pipeline`
- `http://localhost:3000/settings`

Expected: sidebar appears on the left, page content on the right, active nav item is highlighted gold.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: move pages into (app) route group"
```

---

## Task 5: Fix Dashboard page — header and wrapper

**Files:**
- Modify: `app/(app)/dashboard/page.tsx`

The dashboard's outer `<div>` uses `h-screen` which is now redundant (the layout's `<main>` is already `flex-1` in a `h-screen` container). Change it to `h-full` so the internal flex layout fills the available space correctly.

Also remove the three navigation links and the brand logo from the header — the sidebar owns them now.

- [ ] **Step 1: Fix outer wrapper height**

Find this line (~line 556):
```tsx
<div className="flex flex-col h-screen bg-[#0D0F14] text-white font-sans">
```

Change to:
```tsx
<div className="flex flex-col h-full bg-[#0D0F14] text-white font-sans">
```

- [ ] **Step 2: Strip logo + nav links from header**

The header currently spans lines 558–606. Replace the entire `<header>` block with:

```tsx
<header className="flex items-center justify-end px-6 py-3 border-b border-white/[0.07] bg-black/30 shrink-0">
  <div className="flex items-center gap-2">
    {/* Site selector */}
    <select
      value={activeSite.id}
      onChange={e => {
        const site = SITES.find(s => s.id === e.target.value)!
        setActiveSite(site)
        clearSession(site)
      }}
      className="bg-white/5 border border-white/10 rounded-md px-3 py-1.5 text-xs text-gray-300 outline-none cursor-pointer"
    >
      {SITES.map(s => <option key={s.id} value={s.id}>{s.name} — {s.domain}</option>)}
    </select>

    {/* AI provider selector */}
    <select
      value={provider}
      onChange={e => setProvider(e.target.value as Provider)}
      className="bg-white/5 border border-white/10 rounded-md px-3 py-1.5 text-xs text-gray-300 outline-none cursor-pointer"
    >
      {PROVIDERS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
    </select>

    <div className={`w-2 h-2 rounded-full ${loading ? 'bg-[#C9A84C]' : 'bg-[#4CC98E]'} shadow-[0_0_6px_currentColor]`} />
  </div>
</header>
```

- [ ] **Step 3: Verify dashboard renders correctly**

Visit `http://localhost:3000/dashboard`. The header should show only the site selector, AI provider selector, and status dot on the right side. No logo, no nav links.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/dashboard/page.tsx"
git commit -m "feat: strip nav links and logo from dashboard header"
```

---

## Task 6: Fix Marketing Agents page — header and wrapper

**Files:**
- Modify: `app/(app)/dashboard/marketing-agents/page.tsx`

The page's outer wrapper uses `minHeight: "100vh"` — change to `"100%"`. Remove the logo block from the header.

- [ ] **Step 1: Fix outer wrapper height**

Find (~line 671):
```tsx
<div style={{ background: "#0D0F14", minHeight: "100vh", fontFamily: ...
```

Change `minHeight: "100vh"` to `minHeight: "100%"`:
```tsx
<div style={{ background: "#0D0F14", minHeight: "100%", fontFamily: "'Inter', -apple-system, sans-serif", color: "#fff" }}>
```

- [ ] **Step 2: Strip logo block from header**

In the `<header>` (line ~695), remove the first child `<div>` entirely (lines 696–702 — the V-logo and "VULNAGUARD / Marketing Agent Team" title). Also change the header's `justifyContent` from `"space-between"` to `"flex-end"`.

The header becomes:

```tsx
<header style={{ borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "12px 24px", display: "flex", alignItems: "center", justifyContent: "flex-end", background: "rgba(0,0,0,0.3)", position: "sticky", top: 0, zIndex: 100 }}>
  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
    {/* LLM Provider Toggle */}
    <div style={{ display: "flex", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, overflow: "hidden" }}>
      {["claude", "openai"].map(p => (
        <button key={p} onClick={() => toggleProvider(p)}
          style={{ padding: "5px 12px", fontSize: 11, fontWeight: 600, cursor: "pointer", border: "none", background: provider === p ? (p === "claude" ? "#C9A84C" : "#74aa9c") : "transparent", color: provider === p ? "#0D0F14" : "#666", transition: "all 0.15s" }}>
          {p === "claude" ? "Claude" : "OpenAI"}
        </button>
      ))}
    </div>

    <select value={tier} onChange={e => changeTier(e.target.value)}
      style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, padding: "5px 10px", color: "#aaa", fontSize: 11, outline: "none", cursor: "pointer" }}>
      {TIERS.map(t => <option key={t} value={t}>{t}</option>)}
    </select>

    <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#4CC98E", boxShadow: `0 0 6px #4CC98E` }} title="Manual mode" />
  </div>
</header>
```

- [ ] **Step 3: Verify marketing-agents renders correctly**

Visit `http://localhost:3000/dashboard/marketing-agents`. Header shows only the LLM toggle, tier select, and status dot.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/dashboard/marketing-agents/page.tsx"
git commit -m "feat: strip logo from marketing-agents header"
```

---

## Task 7: Fix Settings page header

**Files:**
- Modify: `app/(app)/settings/page.tsx`

Remove the logo block and the "← Back to Agent" link. Replace the header with a minimal page label.

- [ ] **Step 1: Replace the header block**

Find lines 103–114 (the `<header>` in the return JSX):

```tsx
<header className="flex items-center justify-between px-6 py-3 border-b border-white/[0.07] bg-black/30">
  <div className="flex items-center gap-3">
    <div className="w-8 h-8 rounded-md bg-gradient-to-br from-[#C9A84C] to-[#8B6914] flex items-center justify-center text-sm font-bold text-black">⬡</div>
    <div>
      <div className="text-sm font-bold tracking-wide">VULNAGUARD</div>
      <div className="text-[10px] text-[#C9A84C] tracking-[0.15em] uppercase">Agent Settings</div>
    </div>
  </div>
  <a href="/dashboard" className="text-xs text-gray-500 hover:text-gray-300 transition-colors">← Back to Agent</a>
</header>
```

Replace with:

```tsx
<header className="flex items-center justify-end px-6 py-3 border-b border-white/[0.07] bg-black/30">
  <span className="text-[10px] text-[#C9A84C] tracking-[0.15em] uppercase">Agent Settings</span>
</header>
```

- [ ] **Step 2: Fix outer wrapper**

Find (~line 104):
```tsx
<div className="min-h-screen bg-[#0D0F14] text-white font-sans">
```

Change to:
```tsx
<div className="min-h-full bg-[#0D0F14] text-white font-sans">
```

- [ ] **Step 3: Verify settings renders correctly**

Visit `http://localhost:3000/settings`. The header should show only "AGENT SETTINGS" in gold text on the right. No logo, no back link.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/settings/page.tsx"
git commit -m "feat: simplify settings header, remove back link"
```

---

## Task 8: Add view transition CSS

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: Append view transition styles to globals.css**

Add to the end of `app/globals.css`:

```css
/* ── View Transitions ──────────────────────────────── */

/* Page content: fade + slight upward slide */
::view-transition-old(page-content) {
  animation: 150ms ease-in both vt-fade reverse;
}
::view-transition-new(page-content) {
  animation:
    200ms ease-out 100ms both vt-fade,
    200ms ease-out 100ms both vt-slide-up;
}

/* Sidebar: locked in place, never animates */
::view-transition-group(sidebar) {
  animation: none;
  z-index: 100;
}
::view-transition-old(sidebar),
::view-transition-new(sidebar) {
  animation: none;
}

@keyframes vt-fade {
  from { opacity: 0; filter: blur(2px); }
  to   { opacity: 1; filter: blur(0); }
}
@keyframes vt-slide-up {
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

- [ ] **Step 2: Commit**

```bash
git add app/globals.css
git commit -m "feat: add view transition crossfade CSS"
```

---

## Task 9: Final verification

- [ ] **Step 1: Start dev server and navigate all routes**

```bash
npm run dev
```

Manually verify each checkpoint:

| Check | Expected |
|---|---|
| Visit `/dashboard` | Sidebar visible, "Agent" item highlighted gold |
| Click "Marketing" in sidebar | Page changes without white flash, "Marketing" highlighted |
| Click "Content" in sidebar | Page changes without white flash, "Content" highlighted |
| Click "Settings" in sidebar | Page changes without white flash, "Settings" highlighted |
| Navigate to Marketing, scroll down, click "Agent", click "Marketing" again | Lead list and scroll position restored |
| Open Network tab, click any sidebar link | No full document requests (only API calls) |
| Transitions play | Subtle fade + upward slide on content area only; sidebar stays still |

- [ ] **Step 2: Check for TypeScript/lint errors**

```bash
npm run build
```

Expected: build completes with 0 errors, 0 warnings about unknown props or missing types.
