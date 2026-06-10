# GitHub Token, SEO Push Reliability, and Site Switcher Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the GitHub token entered in the Settings UI actually work, surface push errors, fix the site-switcher stale closure, and add Sentinel CMMC to the AI system prompt.

**Architecture:** Tokens entered in the Settings page are saved to `localStorage`. The dashboard reads them at request time and sends them as HTTP headers (`X-GitHub-Token`, `X-AI-Key`). API routes read the header first and fall back to `process.env.*`. The stale-closure fix passes the newly-selected site directly into a parameterised `clearSessionForSite(site)` helper.

**Tech Stack:** Next.js App Router, TypeScript, React hooks, `@octokit/rest`, `localStorage` (browser)

---

### Task 1: Update `lib/github.ts` — accept optional token param

**Files:**
- Modify: `lib/github.ts`

- [ ] **Step 1: Update `getOctokit` to accept an optional token**

Replace:
```typescript
export function getOctokit() {
  const token = process.env.GITHUB_TOKEN
  if (!token) throw new Error('GITHUB_TOKEN not set')
  return new Octokit({ auth: token })
}
```
With:
```typescript
export function getOctokit(token?: string) {
  const resolved = token || process.env.GITHUB_TOKEN
  if (!resolved) throw new Error('GITHUB_TOKEN not set. Add it in Settings or set the GITHUB_TOKEN env var.')
  return new Octokit({ auth: resolved })
}
```

- [ ] **Step 2: Thread the token param through `getRepoFile`, `writeRepoFile`, and `listRepoFiles`**

Replace the full file content with:
```typescript
import { Octokit } from '@octokit/rest'

export function getOctokit(token?: string) {
  const resolved = token || process.env.GITHUB_TOKEN
  if (!resolved) throw new Error('GITHUB_TOKEN not set. Add it in Settings or set the GITHUB_TOKEN env var.')
  return new Octokit({ auth: resolved })
}

export async function getRepoFile(repo: string, path: string, branch = 'main', token?: string) {
  const [owner, repoName] = repo.split('/')
  const octokit = getOctokit(token)
  try {
    const { data } = await octokit.repos.getContent({ owner, repo: repoName, path, ref: branch })
    if ('content' in data) {
      return {
        content: Buffer.from(data.content, 'base64').toString('utf-8'),
        sha: data.sha,
      }
    }
    return null
  } catch {
    return null
  }
}

export async function writeRepoFile(
  repo: string,
  path: string,
  content: string,
  message: string,
  branch = 'main',
  token?: string
) {
  const [owner, repoName] = repo.split('/')
  const octokit = getOctokit(token)

  const existing = await getRepoFile(repo, path, branch, token)

  const params: Parameters<typeof octokit.repos.createOrUpdateFileContents>[0] = {
    owner,
    repo: repoName,
    path,
    message,
    content: Buffer.from(content).toString('base64'),
    branch,
  }
  if (existing?.sha) params.sha = existing.sha

  const { data } = await octokit.repos.createOrUpdateFileContents(params)
  return data
}

export async function listRepoFiles(repo: string, path: string, branch = 'main', token?: string) {
  const [owner, repoName] = repo.split('/')
  const octokit = getOctokit(token)
  try {
    const { data } = await octokit.repos.getContent({ owner, repo: repoName, path, ref: branch })
    if (Array.isArray(data)) {
      return data.map((f) => ({ name: f.name, path: f.path, type: f.type }))
    }
    return []
  } catch {
    return []
  }
}

// Parse agent output for file blocks: ```file:path/to/file.tsx ... ```
export function parseFileBlocks(text: string): Array<{ path: string; content: string }> {
  const regex = /```file:([^\n]+)\n([\s\S]*?)```/g
  const files: Array<{ path: string; content: string }> = []
  let match
  while ((match = regex.exec(text)) !== null) {
    files.push({ path: match[1].trim(), content: match[2].trim() })
  }
  return files
}
```

- [ ] **Step 3: Verify no TypeScript errors**

Run: `cd /Users/seanm/Documents/GitHub/vulnaguard-seo-agent && npx tsc --noEmit`
Expected: no errors related to `lib/github.ts`

- [ ] **Step 4: Commit**

```bash
git add lib/github.ts
git commit -m "feat: accept optional token param in github helpers"
```

---

### Task 2: Update `/api/github/route.ts` — read `X-GitHub-Token` header

**Files:**
- Modify: `app/api/github/route.ts`

- [ ] **Step 1: Extract token from request header and thread it through**

Replace the full file content with:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { writeRepoFile, listRepoFiles, getRepoFile } from '@/lib/github'

export async function POST(req: NextRequest) {
  const { action, repo, path, content, message, branch } = await req.json()
  const token = req.headers.get('x-github-token') || undefined

  try {
    if (action === 'write') {
      const result = await writeRepoFile(repo, path, content, message || `SEO Agent: update ${path}`, branch, token)
      return NextResponse.json({ success: true, commit: result.commit?.sha })
    }
    if (action === 'list') {
      const files = await listRepoFiles(repo, path, branch, token)
      return NextResponse.json({ files })
    }
    if (action === 'read') {
      const file = await getRepoFile(repo, path, branch, token)
      return NextResponse.json({ file })
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'GitHub API error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: clean

- [ ] **Step 3: Commit**

```bash
git add app/api/github/route.ts
git commit -m "feat: read X-GitHub-Token header in github API route"
```

---

### Task 3: Update `/api/agent/route.ts` — read `X-AI-Key` header

**Files:**
- Modify: `app/api/agent/route.ts`

- [ ] **Step 1: Extract AI key from header, prefer over env var**

Replace the key-resolution block at the top of the `POST` function. The current lines:
```typescript
  const anthropicKey = process.env.ANTHROPIC_API_KEY
  const openaiKey = process.env.OPENAI_API_KEY
```
Become:
```typescript
  const headerKey = req.headers.get('x-ai-key') || undefined
  const anthropicKey = (provider === 'anthropic' ? headerKey : undefined) || process.env.ANTHROPIC_API_KEY
  const openaiKey = (provider === 'openai' ? headerKey : undefined) || process.env.OPENAI_API_KEY
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: clean

- [ ] **Step 3: Commit**

```bash
git add app/api/agent/route.ts
git commit -m "feat: read X-AI-Key header in agent API route"
```

---

### Task 4: Update `lib/config.ts` — add Sentinel CMMC to system prompt

**Files:**
- Modify: `lib/config.ts`

- [ ] **Step 1: Add sentinel-cmmc to the SITES YOU MANAGE list in `SEO_SYSTEM_PROMPT`**

Replace:
```typescript
SITES YOU MANAGE:
- vulnaguard.com (Vulnaguard Sentinel — CMMC compliance intelligence)
- mectofitness.com (MectoFitness — fitness & nutrition coaching)
- bluealamo.com (BlueAlamo Investments — Baltimore/DMV real estate)
```
With:
```typescript
SITES YOU MANAGE:
- vulnaguard.com (Vulnaguard Sentinel — CMMC compliance intelligence)
- sentinel-cmmc.vercel.app (Sentinel CMMC — CMMC compliance for defense contractors)
- mectofitness.com (MectoFitness — fitness & nutrition coaching)
- bluealamo.com (BlueAlamo Investments — Baltimore/DMV real estate)
```

- [ ] **Step 2: Commit**

```bash
git add lib/config.ts
git commit -m "fix: add sentinel-cmmc to SEO agent system prompt"
```

---

### Task 5: Update `app/settings/page.tsx` — real localStorage save/load

**Files:**
- Modify: `app/settings/page.tsx`

- [ ] **Step 1: Replace the entire file with a working save/load implementation**

```typescript
'use client'

import { useState, useEffect } from 'react'

interface Setting { key: string; label: string; placeholder: string; help: string; link?: string }

const SETTINGS: Setting[] = [
  {
    key: 'ANTHROPIC_API_KEY',
    label: 'Anthropic API Key',
    placeholder: 'sk-ant-...',
    help: 'Powers the SEO agent intelligence across all modules (Claude models).',
    link: 'https://console.anthropic.com/keys',
  },
  {
    key: 'OPENAI_API_KEY',
    label: 'OpenAI API Key',
    placeholder: 'sk-...',
    help: 'Optional alternative provider — switch the agent to GPT models from the dashboard.',
    link: 'https://platform.openai.com/api-keys',
  },
  {
    key: 'GITHUB_TOKEN',
    label: 'GitHub Personal Access Token',
    placeholder: 'ghp_...',
    help: 'Needs repo scope to read/write files to your site repos. Saved in browser storage.',
    link: 'https://github.com/settings/tokens/new?scopes=repo&description=Vulnaguard+SEO+Agent',
  },
  {
    key: 'PEXELS_API_KEY',
    label: 'Pexels API Key',
    placeholder: 'Your Pexels API key',
    help: 'Free — 200 requests/hour. Used by M6 for blog post images.',
    link: 'https://www.pexels.com/api/',
  },
  {
    key: 'GSC_CLIENT_ID',
    label: 'Google Search Console Client ID',
    placeholder: '*.apps.googleusercontent.com',
    help: 'OAuth 2.0 client ID from Google Cloud Console.',
    link: 'https://console.cloud.google.com/apis/credentials',
  },
  {
    key: 'GSC_CLIENT_SECRET',
    label: 'GSC Client Secret',
    placeholder: 'GOCSPX-...',
    help: 'OAuth 2.0 client secret from Google Cloud Console.',
  },
  {
    key: 'GSC_REFRESH_TOKEN',
    label: 'GSC Refresh Token',
    placeholder: '1//...',
    help: 'Generated after completing OAuth consent. See setup guide below.',
  },
]

export default function Settings() {
  const [values, setValues] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)

  // Load from localStorage on mount
  useEffect(() => {
    const loaded: Record<string, string> = {}
    SETTINGS.forEach(s => {
      const v = localStorage.getItem(s.key)
      if (v) loaded[s.key] = v
    })
    setValues(loaded)
  }, [])

  const handleSave = () => {
    SETTINGS.forEach(s => {
      const v = values[s.key]?.trim()
      if (v) {
        localStorage.setItem(s.key, v)
      } else {
        localStorage.removeItem(s.key)
      }
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const handleCopyEnv = () => {
    const envContent = Object.entries(values)
      .filter(([, v]) => v.trim())
      .map(([k, v]) => `${k}=${v}`)
      .join('\n')
    navigator.clipboard.writeText(envContent)
    setCopied(true)
    setTimeout(() => setCopied(false), 3000)
  }

  return (
    <div className="min-h-screen bg-[#0D0F14] text-white font-sans">
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

      <div className="max-w-2xl mx-auto px-6 py-10">
        <h1 className="text-xl font-bold mb-1">API Configuration</h1>
        <p className="text-sm text-gray-500 mb-8">
          Keys are saved in your browser and sent securely with each request. They are never stored on the server.{' '}
          For server-side defaults, set environment variables on{' '}
          <a href="https://railway.app" target="_blank" rel="noopener" className="text-[#C9A84C] hover:underline">Railway</a>.
        </p>

        <div className="space-y-5">
          {SETTINGS.map(s => (
            <div key={s.key} className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-5">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <label className="text-sm font-semibold text-white">{s.label}</label>
                  <p className="text-xs text-gray-500 mt-0.5">{s.help}</p>
                </div>
                {s.link && (
                  <a href={s.link} target="_blank" rel="noopener" className="text-[10px] text-[#C9A84C] hover:underline whitespace-nowrap ml-4">
                    Get key →
                  </a>
                )}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="password"
                  value={values[s.key] || ''}
                  onChange={e => setValues(prev => ({ ...prev, [s.key]: e.target.value }))}
                  placeholder={s.placeholder}
                  className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm font-mono text-gray-300 placeholder-gray-700 outline-none focus:border-[#C9A84C]/40 transition-colors"
                />
                {values[s.key] && (
                  <span className="text-[10px] text-[#4CC98E] shrink-0">✓ saved</span>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex gap-3">
          <button
            onClick={handleSave}
            className="flex-1 py-3 font-bold text-sm rounded-xl transition-all"
            style={{ background: 'linear-gradient(135deg, #C9A84C, #8B6914)', color: '#0D0F14' }}
          >
            {saved ? '✓ Saved to browser — agent will use these keys' : 'Save Keys'}
          </button>
          <button
            onClick={handleCopyEnv}
            className="px-5 py-3 text-sm text-gray-400 bg-white/[0.04] border border-white/[0.08] rounded-xl hover:text-white transition-colors"
          >
            {copied ? '✓ Copied' : 'Copy .env'}
          </button>
        </div>

        {/* GSC Setup Guide */}
        <div className="mt-10 bg-white/[0.02] border border-white/[0.06] rounded-xl p-6">
          <h2 className="text-sm font-bold text-[#C9A84C] mb-3">Google Search Console Setup</h2>
          <ol className="space-y-2">
            {[
              'Go to Google Cloud Console → Create or select a project',
              'Enable the Search Console API',
              'Go to Credentials → Create OAuth 2.0 Client ID (Desktop app type)',
              'Download credentials.json',
              'Run: npx @googleapis/searchconsole oauth — this opens a browser for consent and outputs your refresh token',
              'Paste the Client ID, Client Secret, and Refresh Token above',
            ].map((step, i) => (
              <li key={i} className="flex gap-3 text-xs text-gray-400">
                <span className="text-[#C9A84C] font-mono shrink-0">{i + 1}.</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>

        {/* GitHub Token Setup */}
        <div className="mt-5 bg-white/[0.02] border border-white/[0.06] rounded-xl p-6">
          <h2 className="text-sm font-bold text-[#C9A84C] mb-3">GitHub Token Setup</h2>
          <ol className="space-y-2">
            {[
              'Go to github.com/settings/tokens → Generate new token (classic)',
              'Select repo scope (full control of private repositories)',
              'Set expiration to 1 year',
              'Copy the token — it starts with ghp_',
              'Paste it into the GitHub Personal Access Token field above and click Save Keys',
            ].map((step, i) => (
              <li key={i} className="flex gap-3 text-xs text-gray-400">
                <span className="text-[#C9A84C] font-mono shrink-0">{i + 1}.</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: clean

- [ ] **Step 3: Commit**

```bash
git add app/settings/page.tsx
git commit -m "feat: settings page saves/loads keys from localStorage"
```

---

### Task 6: Update `app/dashboard/page.tsx` — read localStorage headers, fix stale closure, surface errors

**Files:**
- Modify: `app/dashboard/page.tsx`

- [ ] **Step 1: Add a `getStoredKeys` helper inside the component (before the return)**

Add this function after the `useEffect` for scroll:
```typescript
  const getStoredKeys = () => ({
    githubToken: typeof window !== 'undefined' ? localStorage.getItem('GITHUB_TOKEN') || undefined : undefined,
    aiKey: typeof window !== 'undefined' ? localStorage.getItem(provider === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY') || undefined : undefined,
  })
```

- [ ] **Step 2: Thread `X-AI-Key` header into `streamAgent`**

In `streamAgent`, change the fetch call body for `/api/agent`:
```typescript
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(getStoredKeys().aiKey ? { 'X-AI-Key': getStoredKeys().aiKey! } : {}),
        },
        body: JSON.stringify({
          messages: conversationRef.current,
          siteId: activeSite.id,
          siteDomain: activeSite.domain,
          provider,
        }),
      })
```

- [ ] **Step 3: Thread `X-GitHub-Token` header into `deployFiles` and surface errors**

Replace the full `deployFiles` function:
```typescript
  const deployFiles = async () => {
    if (!pendingFiles.length) return
    setDeployStatus('Pushing to GitHub...')
    const { githubToken } = getStoredKeys()
    const results: string[] = []

    for (const file of pendingFiles) {
      try {
        const res = await fetch('/api/github', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(githubToken ? { 'X-GitHub-Token': githubToken } : {}),
          },
          body: JSON.stringify({
            action: 'write',
            repo: activeSite.repo,
            path: file.path,
            content: file.content,
            message: `SEO Agent: add/update ${file.path}`,
            branch: activeSite.branch,
          }),
        })
        const data = await res.json()
        if (data.success) {
          results.push(`✓ ${file.path}`)
        } else {
          results.push(`✗ ${file.path}: ${data.error || 'unknown error'}`)
        }
      } catch (err) {
        results.push(`✗ ${file.path}: ${err instanceof Error ? err.message : 'network error'}`)
      }
    }

    const successCount = results.filter(r => r.startsWith('✓')).length
    const allPassed = successCount === pendingFiles.length
    setDeployStatus(
      allPassed
        ? `✓ Pushed ${successCount}/${pendingFiles.length} files → Vercel deploying...`
        : `Pushed ${successCount}/${pendingFiles.length} files. ${results.filter(r => r.startsWith('✗')).join(' | ')}`
    )
    setTimeout(() => setDeployStatus(null), 8000)
    setPendingFiles([])
  }
```

- [ ] **Step 4: Fix the stale-closure site switcher bug**

Replace `clearSession`:
```typescript
  const clearSession = (site?: SiteConfig) => {
    const s = site ?? activeSite
    conversationRef.current = []
    setMessages([{ role: 'assistant', content: `**Vulnaguard SEO Agent ready.**\n\nActive site: \`${s.domain}\`\n\nSelect a module or type a command.` }])
    setPendingFiles([])
    setActiveModule(null)
  }
```

Update the site selector `onChange` to pass the new site:
```typescript
            onChange={e => {
              const site = SITES.find(s => s.id === e.target.value)!
              setActiveSite(site)
              clearSession(site)
            }}
```

- [ ] **Step 5: Fix M1 module prompt topic for `sentinel-cmmc`**

In `handleModule`, replace the `prompts[1]` value:
```typescript
      1: `Run M1 Research & Strategy for ${activeSite.domain}. Primary topic: ${
        activeSite.id === 'vulnaguard' ? 'CMMC compliance software' :
        activeSite.id === 'sentinel-cmmc' ? 'CMMC compliance for defense contractors' :
        activeSite.id === 'mectofitness' ? 'fitness coaching for busy adults' :
        'Baltimore real estate investment'
      }. Output full keyword strategy doc with medium-match targets only.`,
```

- [ ] **Step 6: Verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: clean

- [ ] **Step 7: Commit**

```bash
git add app/dashboard/page.tsx
git commit -m "fix: localStorage headers, stale site-switcher closure, surfaced push errors, sentinel-cmmc topic"
```

---

### Task 7: Smoke test end-to-end

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 2: Verify Settings save/load**

1. Open `http://localhost:3000/settings`
2. Enter a GitHub token (real or dummy `ghp_test`)
3. Click **Save Keys**
4. Refresh the page
5. Expected: token field is pre-filled (shown as password dots), green "✓ saved" indicator visible

- [ ] **Step 3: Verify site switcher shows correct domain**

1. Open `http://localhost:3000/dashboard`
2. Switch site dropdown from Vulnaguard to MectoFitness
3. Expected: welcome message says `mectofitness.com`, NOT `vulnaguard.com`

- [ ] **Step 4: Verify push error is surfaced**

1. Enter a bad/dummy GitHub token in Settings and Save
2. On dashboard, trigger a module that produces file blocks (M5 Page Factory)
3. Click "Push to GitHub & Deploy"
4. Expected: deploy banner shows something like "Pushed 0/1 files. ✗ app/blog/...: 401 Bad credentials"
   (not the silent "Pushed 0/1 files" with no explanation)

- [ ] **Step 5: Commit smoke test checkpoint**

```bash
git add -A
git commit -m "chore: smoke test checkpoint — all manual checks passed" --allow-empty
```
