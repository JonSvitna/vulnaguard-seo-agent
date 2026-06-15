'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { SITES, SiteConfig } from '@/lib/config'
import { parseFileBlocks } from '@/lib/github'

const MODULES = [
  { id: 1, code: 'M1', label: 'Research & Strategy', desc: 'Keyword tiers, competitor gaps', color: '#C9A84C' },
  { id: 2, code: 'M2', label: 'Ranking Monitor', desc: 'GSC quick wins, declines, gaps', color: '#4C8EC9' },
  { id: 3, code: 'M3', label: 'On-Page Auditor', desc: 'Score 9 elements per page', color: '#7C6AC4' },
  { id: 4, code: 'M4', label: 'On-Page Executor', desc: 'Apply approved changes', color: '#4CC98E' },
  { id: 5, code: 'M5', label: 'Page Factory', desc: 'Zipper blog + service pages', color: '#C94C4C' },
  { id: 6, code: 'M6', label: 'Pexels Images', desc: 'Auto-fetch supporting images', color: '#C97C4C' },
]

interface Message { role: 'user' | 'assistant'; content: string }
interface PendingFile { path: string; content: string }
interface SessionResult { kind: string; path?: string; content: string; status?: string }
interface SessionSummary {
  id: string
  title: string | null
  phase: string | null
  phase_status: string | null
  updated_at: string
}
interface SessionDetail {
  session?: { phase?: string; phase_status?: string }
  messages?: Array<{ role: 'user' | 'assistant'; content: string }>
  results?: SessionResult[]
}

const PROVIDERS = [
  { id: 'anthropic', label: 'Claude (Anthropic)' },
  { id: 'openai', label: 'GPT-4o (OpenAI)' },
] as const

type Provider = typeof PROVIDERS[number]['id']

interface PhaseState {
  phase: 'research' | 'monitor' | 'audit' | 'execute' | 'factory' | 'images' | null
  status: 'pending' | 'ready' | 'approved' | null
}

// Helper: parse phase marker from response
function extractPhaseMarker(text: string): { phase: string; status: string } | null {
  const match = text.match(/<!-- PHASE:(\w+):(\w+) -->/)
  return match ? { phase: match[1].toLowerCase(), status: match[2].toLowerCase() } : null
}

// Helper: format an ISO timestamp as a short relative time
function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

// Helper: determine next module after approval
function getNextModuleAfterPhase(phase: string): number | null {
  const phaseToModule: Record<string, number | null> = {
    research: 2,
    monitor: 3,
    audit: 4,
    factory: 6, // M5 starts from M3 approval
    execute: 5,
    images: null,
  }
  return phaseToModule[phase] || null
}

export default function Dashboard() {
  const [activeSite, setActiveSite] = useState<SiteConfig>(SITES[0])
  const [provider, setProvider] = useState<Provider>('anthropic')
  const [activeModule, setActiveModule] = useState<number | null>(null)
  const [phaseState, setPhaseState] = useState<PhaseState>({ phase: null, status: null })
  const [messages, setMessages] = useState<Message[]>([{
    role: 'assistant',
    content: `**Vulnaguard SEO Agent ready.**\n\nActive site: \`${SITES[0].domain}\`\n\nSelect a module or type a command. Use **Full SEO Pass** to run M1→M2→M3 in sequence.\n\nAll approved changes push directly to GitHub → auto-deploy on Vercel.`,
  }])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([])
  const [recoveredFiles, setRecoveredFiles] = useState<PendingFile[]>([])
  const [showRecoveredPreview, setShowRecoveredPreview] = useState(false)
  const [recentResults, setRecentResults] = useState<SessionResult[]>([])
  const [deployStatus, setDeployStatus] = useState<{ type: 'info' | 'success' | 'error'; message: string } | null>(null)
  const [blogs, setBlogs] = useState(0)
  const [services, setServices] = useState(0)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sessionList, setSessionList] = useState<SessionSummary[]>([])
  const [persistenceError, setPersistenceError] = useState<string | null>(null)
  const conversationRef = useRef<Message[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)
  const sessionIdRef = useRef<string | null>(null)

  useEffect(() => { sessionIdRef.current = sessionId }, [sessionId])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const getStoredKeys = () => ({
    githubToken: typeof window !== 'undefined' ? localStorage.getItem('GITHUB_TOKEN') || undefined : undefined,
    aiKey: typeof window !== 'undefined' ? localStorage.getItem(provider === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY') || undefined : undefined,
  })

  const getSessionStorageKey = (siteId: string) => `VG_ACTIVE_SESSION_${siteId}`

  const refreshInventoryBaseline = useCallback(async (site: SiteConfig) => {
    try {
      const githubToken = typeof window !== 'undefined' ? localStorage.getItem('GITHUB_TOKEN') || undefined : undefined
      const qs = new URLSearchParams({
        scan: '1',
        repo: site.repo,
        branch: site.branch,
        contentPath: site.contentPath,
      })
      const res = await fetch(`/api/inventory/${encodeURIComponent(site.id)}?${qs.toString()}`, {
        headers: {
          ...(githubToken ? { 'X-GitHub-Token': githubToken } : {}),
        },
      })
      if (!res.ok) return
      const data = await res.json()
      setBlogs(data.blogs ?? 0)
      setServices(data.services ?? 0)
    } catch {
      // best effort
    }
  }, [])

  // Apply a fetched session's messages/results/phase into the UI state.
  const applySessionDetail = useCallback((detail: SessionDetail, id: string, site: SiteConfig) => {
    const restored: Message[] = (detail.messages ?? []).map(m => ({ role: m.role, content: m.content }))
    const allResults: SessionResult[] = detail.results ?? []
    const pushedPaths = new Set(
      allResults
        .filter(r => r.kind === 'deploy' && r.status === 'pushed' && r.path)
        .map(r => r.path as string),
    )
    const discardedPaths = new Set(
      allResults
        .filter(r => r.kind === 'file' && r.status === 'discarded' && r.path)
        .map(r => r.path as string),
    )
    const latestFileByPath = new Map<string, PendingFile>()
    for (const r of allResults) {
      if (r.kind === 'file' && r.path && typeof r.content === 'string') {
        latestFileByPath.set(r.path, { path: r.path, content: r.content })
      }
    }
    const recoverable = Array.from(latestFileByPath.values()).filter(
      f => !pushedPaths.has(f.path) && !discardedPaths.has(f.path),
    )
    conversationRef.current = restored
    setSessionId(id)
    setRecoveredFiles(recoverable)
    setRecentResults(allResults)
    setPendingFiles([])
    setShowRecoveredPreview(false)
    if (detail.session?.phase && detail.session?.phase_status) {
      setPhaseState({
        phase: detail.session.phase as PhaseState['phase'],
        status: detail.session.phase_status as PhaseState['status'],
      })
    } else {
      setPhaseState({ phase: null, status: null })
    }
    if (restored.length > 0) {
      setMessages(restored)
    } else if (allResults.length > 0) {
      setMessages([{
        role: 'assistant',
        content: `Restored prior session for ${site.domain}.\n\nRecovered results: ${allResults.length} entries. Use the recovered files banner to re-queue deployable files.`,
      }])
    } else {
      setMessages([{
        role: 'assistant',
        content: `**Vulnaguard SEO Agent ready.**\n\nActive site: \`${site.domain}\`\n\nSelect a module or type a command. Use **Full SEO Pass** to run M1→M2→M3 in sequence.\n\nAll approved changes push directly to GitHub → auto-deploy on Vercel.`,
      }])
    }
    if (typeof window !== 'undefined') {
      localStorage.setItem(getSessionStorageKey(site.id), id)
    }
  }, [])

  const refreshSessionList = useCallback(async (site: SiteConfig) => {
    try {
      const res = await fetch(`/api/sessions?siteId=${encodeURIComponent(site.id)}`)
      if (!res.ok) return null
      const data = await res.json()
      const sessions: SessionSummary[] = data.sessions ?? []
      setSessionList(sessions)
      return sessions
    } catch {
      return null
    }
  }, [])

  // Explicitly load a past session (from the history panel).
  const loadSession = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/sessions/${id}`)
      if (!res.ok) {
        setPersistenceError(`Failed to load session (${res.status})`)
        return
      }
      const detail: SessionDetail = await res.json()
      applySessionDetail(detail, id, activeSite)
      setPersistenceError(null)
    } catch (err) {
      setPersistenceError(err instanceof Error ? err.message : 'Failed to load session')
    }
  }, [activeSite, applySessionDetail])

  const deleteSession = useCallback(async (id: string) => {
    if (typeof window !== 'undefined' && !window.confirm('Delete this session? This cannot be undone.')) return
    try {
      const res = await fetch(`/api/sessions/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        setPersistenceError(`Failed to delete session (${res.status})`)
        return
      }
    } catch (err) {
      setPersistenceError(err instanceof Error ? err.message : 'Failed to delete session')
      return
    }
    setPersistenceError(null)
    const remaining = sessionList.filter(s => s.id !== id)
    setSessionList(remaining)
    if (id === sessionIdRef.current) {
      if (remaining.length > 0) {
        await loadSession(remaining[0].id)
      } else {
        clearSession()
      }
    }
  }, [sessionList, loadSession])

  // Load resumable session + inventory baseline whenever the active site changes.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const sessRes = await fetch(`/api/sessions?siteId=${encodeURIComponent(activeSite.id)}`)
        if (cancelled) return
        if (!sessRes.ok) {
          setPersistenceError(`Failed to load sessions (${sessRes.status})`)
        }
        const sessJson = sessRes.ok ? await sessRes.json() : { sessions: [] }
        await refreshInventoryBaseline(activeSite)
        if (cancelled) return
        const sessions: SessionSummary[] = sessJson.sessions ?? []
        setSessionList(sessions)
        const preferredId = typeof window !== 'undefined' ? localStorage.getItem(getSessionStorageKey(activeSite.id)) : null

        const pickOrder = [
          ...(preferredId ? [preferredId] : []),
          ...sessions.map(s => s.id).filter(id => id !== preferredId),
        ].slice(0, 10)

        let selectedDetail: SessionDetail | null = null
        let selectedId: string | null = null

        for (const sid of pickOrder) {
          const detailRes = await fetch(`/api/sessions/${sid}`)
          if (!detailRes.ok) continue
          const detail = await detailRes.json()
          const hasMessages = Array.isArray(detail.messages) && detail.messages.length > 0
          const hasResults = Array.isArray(detail.results) && detail.results.length > 0
          if (hasMessages || hasResults || sid === preferredId) {
            selectedDetail = detail
            selectedId = sid
            if (hasMessages || hasResults) break
          }
        }

        if (selectedDetail && selectedId && !cancelled) {
          applySessionDetail(selectedDetail, selectedId, activeSite)
        } else {
          setSessionId(null)
          conversationRef.current = []
          setRecoveredFiles([])
          setRecentResults([])
          setPendingFiles([])
          setShowRecoveredPreview(false)
          setPhaseState({ phase: null, status: null })
        }
        if (sessRes.ok) setPersistenceError(null)
      } catch (err) {
        if (!cancelled) setPersistenceError(err instanceof Error ? err.message : 'Persistence unavailable')
      }
    })()
    return () => { cancelled = true }
  }, [activeSite, refreshInventoryBaseline, applySessionDetail])

  const ensureSession = useCallback(async (): Promise<string | null> => {
    if (sessionIdRef.current) return sessionIdRef.current
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId: activeSite.id, provider }),
      })
      if (!res.ok) {
        setPersistenceError(`Failed to create session (${res.status})`)
        return null
      }
      const { id } = await res.json()
      sessionIdRef.current = id
      setSessionId(id)
      if (typeof window !== 'undefined') {
        localStorage.setItem(getSessionStorageKey(activeSite.id), id)
      }
      setPersistenceError(null)
      refreshSessionList(activeSite)
      return id
    } catch (err) {
      setPersistenceError(err instanceof Error ? err.message : 'Failed to create session')
      return null
    }
  }, [activeSite, provider, refreshSessionList])

  const persistMessage = useCallback(async (sid: string, role: 'user' | 'assistant', content: string) => {
    try {
      const res = await fetch(`/api/sessions/${sid}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, content }),
      })
      if (!res.ok) {
        setPersistenceError(`Failed to save message (${res.status})`)
        return
      }
      setPersistenceError(null)
      if (role === 'user') refreshSessionList(activeSite)
    } catch (err) {
      setPersistenceError(err instanceof Error ? err.message : 'Failed to save message')
    }
  }, [activeSite, refreshSessionList])

  const streamAgent = useCallback(async (userMessage: string) => {
    const { aiKey } = getStoredKeys()
    const userMsg: Message = { role: 'user', content: userMessage }
    setMessages(prev => [...prev, userMsg])
    conversationRef.current = [...conversationRef.current, userMsg]
    setLoading(true)
    setPendingFiles([])

    const sid = await ensureSession()
    if (sid) persistMessage(sid, 'user', userMessage)

    let fullResponse = ''
    const assistantMsg: Message = { role: 'assistant', content: '' }
    setMessages(prev => [...prev, assistantMsg])

    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(aiKey ? { 'X-AI-Key': aiKey } : {}),
        },
        body: JSON.stringify({
          messages: conversationRef.current,
          siteId: activeSite.id,
          siteDomain: activeSite.domain,
          provider,
        }),
      })

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value)
        fullResponse += chunk
        setMessages(prev => {
          const updated = [...prev]
          updated[updated.length - 1] = { role: 'assistant', content: fullResponse }
          return updated
        })
      }

      // Parse file blocks from response
      const files = parseFileBlocks(fullResponse)
      
      // Parse phase readiness marker
      const phaseMarker = extractPhaseMarker(fullResponse)
      if (phaseMarker) {
        setPhaseState({
          phase: phaseMarker.phase as PhaseState['phase'],
          status: phaseMarker.status as PhaseState['status'],
        })
        
        // Update session phase in DB
        if (sid) {
          fetch(`/api/sessions/${sid}/phase`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              phase: phaseMarker.phase,
              status: phaseMarker.status,
            }),
          }).then(res => {
            if (!res.ok) setPersistenceError(`Failed to save phase (${res.status})`)
            else { setPersistenceError(null); refreshSessionList(activeSite) }
          }).catch(err => setPersistenceError(err instanceof Error ? err.message : 'Failed to save phase'))
        }
      }
      
      if (files.length > 0) {
        setPendingFiles(files)
        setRecoveredFiles([])
        setRecentResults(prev => [
          ...files.map(f => ({ kind: 'file', path: f.path, content: f.content, status: 'pending' })),
          ...prev,
        ])
        setShowRecoveredPreview(false)
        if (sid) {
          fetch(`/api/sessions/${sid}/results`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              results: files.map(f => ({
                kind: 'file', path: f.path, content: f.content, status: 'pending', siteId: activeSite.id,
              })),
            }),
          }).then(res => {
            if (!res.ok) setPersistenceError(`Failed to save results (${res.status})`)
            else setPersistenceError(null)
          }).catch(err => setPersistenceError(err instanceof Error ? err.message : 'Failed to save results'))
        }
      }

      conversationRef.current = [...conversationRef.current, { role: 'assistant', content: fullResponse }]
      if (sid) persistMessage(sid, 'assistant', fullResponse)
    } catch (err) {
      setMessages(prev => {
        const updated = [...prev]
        updated[updated.length - 1] = { role: 'assistant', content: `**Error:** ${err instanceof Error ? err.message : 'Unknown error'}` }
        return updated
      })
    }
    setLoading(false)
  }, [activeSite, provider, ensureSession, persistMessage, refreshSessionList])

  const deployFiles = async () => {
    if (!pendingFiles.length) return
    setDeployStatus({ type: 'info', message: 'Pushing to GitHub...' })
    const { githubToken } = getStoredKeys()

    try {
      const res = await fetch('/api/github', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(githubToken ? { 'X-GitHub-Token': githubToken } : {}),
        },
        body: JSON.stringify({
          action: 'writeMany',
          repo: activeSite.repo,
          files: pendingFiles,
          message: `SEO Agent: batch update ${pendingFiles.length} files`,
          branch: activeSite.branch,
        }),
      })
      const data = await res.json()

      if (!res.ok || !data.success) {
        const err = data.error || `HTTP ${res.status}`
        setDeployStatus({ type: 'error', message: `Push failed — ${err}` })
        setTimeout(() => setDeployStatus(null), 8000)
        return
      }

      setDeployStatus({ type: 'success', message: `✓ Pushed ${pendingFiles.length}/${pendingFiles.length} files in one commit (${data.commit?.slice(0, 7)})` })

      if (sessionIdRef.current) {
        fetch(`/api/sessions/${sessionIdRef.current}/results`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            results: pendingFiles.map(f => ({
              kind: 'deploy', path: f.path, content: f.content, status: 'pushed', siteId: activeSite.id,
            })),
          }),
        }).then(res => {
          if (!res.ok) setPersistenceError(`Failed to save deploy results (${res.status})`)
          else setPersistenceError(null)
        }).catch(err => setPersistenceError(err instanceof Error ? err.message : 'Failed to save deploy results'))
      }

      setRecentResults(prev => [
        ...pendingFiles.map(f => ({ kind: 'deploy', path: f.path, content: f.content, status: 'pushed' })),
        ...prev,
      ])

      await refreshInventoryBaseline(activeSite)

      setTimeout(() => setDeployStatus(null), 6000)
      setPendingFiles([])
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setDeployStatus({ type: 'error', message: `Push failed: ${message}` })
      setTimeout(() => setDeployStatus(null), 8000)
    }
  }

  const handleModule = (moduleId: number) => {
    setActiveModule(moduleId)
    const prompts: Record<number, string> = {
      1: `Run M1 Research & Strategy for ${activeSite.domain}. Primary topic: ${
        activeSite.id === 'vulnaguard' ? 'CMMC compliance software' :
        activeSite.id === 'sentinel-cmmc' ? 'CMMC compliance for defense contractors' :
        activeSite.id === 'mectofitness' ? 'fitness coaching for busy adults' :
        'Baltimore real estate investment'
      }. Output full keyword strategy doc with medium-match targets only.`,
      2: `Run M2 Ranking Monitor for ${activeSite.domain}. Pull GSC data, classify into Quick Wins, Declining, Indexing Gaps, Stable. Output full ranking opportunity report.`,
      3: `Run M3 On-Page Auditor for the homepage of ${activeSite.domain}. Score all 9 elements and output specific recommendations for every failing element.`,
      4: `Run M4 On-Page Executor. Based on audit recommendations in this session, output all approved changes as exact replacement content ready to commit. Format for Next.js with generateMetadata() and JSON-LD schema.`,
      5: `Run M5 Page Factory for ${activeSite.domain}. Create one complete zipper pair: a fully optimized blog post + corresponding service page. Output as file blocks ready for GitHub. Check inventory first.`,
      6: `Run M6 Pexels Images for the most recent page created in this session. Determine image count by post length, generate search queries, output complete <img> tags with alt text and attribution line.`,
    }
    streamAgent(prompts[moduleId])
  }

  const handleSend = () => {
    if (!input.trim() || loading) return
    streamAgent(input.trim())
    setInput('')
  }

  const clearSession = (site?: SiteConfig) => {
    const s = site ?? activeSite
    conversationRef.current = []
    sessionIdRef.current = null
    setSessionId(null)
    setMessages([{ role: 'assistant', content: `**Vulnaguard SEO Agent ready.**\n\nActive site: \`${s.domain}\`\n\nSelect a module or type a command.` }])
    setPendingFiles([])
    setRecoveredFiles([])
    setRecentResults([])
    setShowRecoveredPreview(false)
    setPhaseState({ phase: null, status: null })
    setActiveModule(null)
    if (typeof window !== 'undefined') {
      localStorage.removeItem(getSessionStorageKey(s.id))
    }
  }

  return (
    <div className="flex flex-col h-full bg-[#0D0F14] text-white font-sans">
      {/* Header */}
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

      {/* Deploy banner */}
      {deployStatus && (
        <div
          className={`border-b px-6 py-2 text-xs ${
            deployStatus.type === 'error'
              ? 'bg-[#C94C4C]/10 border-[#C94C4C]/20 text-[#C94C4C]'
              : deployStatus.type === 'success'
                ? 'bg-[#4CC98E]/10 border-[#4CC98E]/20 text-[#4CC98E]'
                : 'bg-[#C9A84C]/10 border-[#C9A84C]/20 text-[#C9A84C]'
          }`}
        >
          {deployStatus.message}
        </div>
      )}

      {/* Persistence error banner */}
      {persistenceError && (
        <div className="border-b px-6 py-2 text-xs bg-[#C94C4C]/10 border-[#C94C4C]/20 text-[#C94C4C] flex items-center justify-between gap-3">
          <span>Session persistence unavailable — your work won&apos;t be saved. ({persistenceError})</span>
          <button onClick={() => setPersistenceError(null)} className="text-[#C94C4C]/70 hover:text-[#C94C4C] shrink-0">✕</button>
        </div>
      )}

      {/* Recovered files banner (reload-safe confirmation gate) */}
      {recoveredFiles.length > 0 && pendingFiles.length === 0 && (
        <div className="bg-[#4C8EC9]/10 border-b border-[#4C8EC9]/20 px-6 py-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-[#4C8EC9]">
              Recovered {recoveredFiles.length} generated file{recoveredFiles.length > 1 ? 's' : ''} from the last session.
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setShowRecoveredPreview(prev => !prev)}
                className="text-xs text-gray-400 hover:text-gray-200 transition-colors"
              >
                {showRecoveredPreview ? 'Hide' : 'Review'}
              </button>
              <button
                onClick={() => {
                  setPendingFiles(recoveredFiles)
                  setRecoveredFiles([])
                  setShowRecoveredPreview(false)
                }}
                className="bg-[#4C8EC9] text-black text-xs font-bold px-3 py-1 rounded hover:bg-[#62a3db] transition-colors"
              >
                Re-queue for Deploy
              </button>
              <button
                onClick={() => {
                  if (sessionIdRef.current) {
                    fetch(`/api/sessions/${sessionIdRef.current}/results`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        results: recoveredFiles.map(f => ({
                          kind: 'file', path: f.path, content: f.content, status: 'discarded', siteId: activeSite.id,
                        })),
                      }),
                    }).then(res => {
                      if (!res.ok) setPersistenceError(`Failed to save results (${res.status})`)
                      else setPersistenceError(null)
                    }).catch(err => setPersistenceError(err instanceof Error ? err.message : 'Failed to save results'))
                  }
                  setRecoveredFiles([])
                  setShowRecoveredPreview(false)
                }}
                className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >
                Discard
              </button>
            </div>
          </div>
          {showRecoveredPreview && (
            <div className="mt-2 text-[10px] text-gray-400">
              {recoveredFiles.slice(0, 8).map(f => (
                <span key={f.path} className="inline-block bg-white/10 px-1 rounded mr-1 mb-1">{f.path}</span>
              ))}
              {recoveredFiles.length > 8 && <span className="text-gray-500">+{recoveredFiles.length - 8} more</span>}
            </div>
          )}
        </div>
      )}

      {/* Pending files banner */}
      {pendingFiles.length > 0 && (
        <div className="bg-[#C9A84C]/10 border-b border-[#C9A84C]/20 px-6 py-2 flex items-center justify-between">
          <span className="text-xs text-[#C9A84C]">
            {pendingFiles.length} file{pendingFiles.length > 1 ? 's' : ''} ready to push →{' '}
            {pendingFiles.map(f => <code key={f.path} className="bg-white/10 px-1 rounded text-[10px] mr-1">{f.path}</code>)}
          </span>
          <div className="flex gap-2">
            <button onClick={() => setPendingFiles([])} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">Discard</button>
            <button onClick={deployFiles} className="bg-[#C9A84C] text-black text-xs font-bold px-3 py-1 rounded hover:bg-[#d4b05a] transition-colors">
              Push to GitHub & Deploy
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-52 shrink-0 border-r border-white/[0.07] flex flex-col gap-2 p-3 overflow-y-auto">
          {/* Inventory */}
          <div className="bg-white/[0.03] border border-white/[0.07] rounded-lg p-3 mb-1">
            <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">Page Inventory</p>
            {[
              { label: 'Blogs', val: blogs, color: '#C94C4C' },
              { label: 'Services', val: services, color: '#4C8EC9' },
            ].map(item => (
              <div key={item.label} className="mb-2">
                <div className="flex justify-between mb-1">
                  <span className="text-[11px] text-gray-500">{item.label}</span>
                  <span className="text-[11px] font-mono" style={{ color: item.val >= 18 ? '#C94C4C' : '#666' }}>{item.val}/20</span>
                </div>
                <div className="h-1 bg-white/[0.06] rounded">
                  <div className="h-full rounded transition-all duration-500" style={{ width: `${(item.val / 20) * 100}%`, background: item.color }} />
                </div>
              </div>
            ))}
          </div>

          {/* Repo info */}
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-3 mb-1">
            <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-1">GitHub Repo</p>
            <p className="text-[11px] font-mono text-gray-400 break-all">{activeSite.repo}</p>
            <p className="text-[10px] text-gray-600 mt-1">branch: {activeSite.branch}</p>
          </div>

          {/* Prior results */}
          {recentResults.length > 0 && (
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-3 mb-1">
              <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-1">Prior Results</p>
              <p className="text-[10px] text-gray-500 mb-2">{recentResults.length} restored</p>
              <div className="space-y-1 max-h-24 overflow-y-auto">
                {recentResults.slice(0, 8).map((r, idx) => (
                  <div key={`${r.kind}-${r.path ?? idx}`} className="text-[10px] text-gray-400 truncate">
                    <span className="text-gray-500">{r.kind}</span>
                    {r.path ? `: ${r.path}` : ''}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Past scans / session history */}
          {sessionList.length > 0 && (
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-3 mb-1">
              <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-2">Past Scans</p>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {sessionList.map(s => (
                  <div
                    key={s.id}
                    onClick={() => { if (s.id !== sessionId) loadSession(s.id) }}
                    className="flex items-center gap-1 rounded px-2 py-1.5 cursor-pointer transition-colors"
                    style={{
                      background: s.id === sessionId ? 'rgba(201,168,76,0.08)' : 'transparent',
                      border: `1px solid ${s.id === sessionId ? 'rgba(201,168,76,0.3)' : 'transparent'}`,
                    }}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] text-gray-300 truncate">{s.title || 'Untitled session'}</div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[9px] text-gray-600">{formatRelativeTime(s.updated_at)}</span>
                        {s.phase && (
                          <span className="text-[9px] text-[#4C8EC9] font-mono">{s.phase} · {s.phase_status}</span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); deleteSession(s.id) }}
                      className="text-gray-600 hover:text-[#C94C4C] text-xs shrink-0 px-1"
                      title="Delete session"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Full pass */}
          <button
            onClick={() => {
              setActiveModule(null)
              streamAgent(`Run a Full SEO Pass for ${activeSite.domain}: M1 keyword research → M2 ranking monitor → M3 audit homepage. Present combined findings then wait for approval before M4/M5/M6.`)
            }}
            disabled={loading}
            className="w-full py-2.5 text-xs font-bold text-[#C9A84C] bg-[#C9A84C]/10 border border-[#C9A84C]/30 rounded-lg hover:bg-[#C9A84C]/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ⚡ Full SEO Pass
          </button>

          <p className="text-[10px] text-gray-600 uppercase tracking-widest px-1 mt-1">Modules</p>

          {MODULES.map(m => (
            <button
              key={m.id}
              onClick={() => handleModule(m.id)}
              disabled={loading}
              className="w-full text-left p-3 rounded-lg border transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: activeModule === m.id ? `${m.color}15` : 'rgba(255,255,255,0.02)',
                borderColor: activeModule === m.id ? `${m.color}60` : 'rgba(255,255,255,0.07)',
              }}
            >
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded" style={{ color: m.color, background: `${m.color}20` }}>{m.code}</span>
                <span className="text-xs font-semibold text-gray-300">{m.label}</span>
              </div>
              <p className="text-[10px] text-gray-600 leading-snug">{m.desc}</p>
            </button>
          ))}

          <button onClick={() => clearSession()} className="mt-auto w-full py-2 text-xs text-gray-600 hover:text-gray-400 border border-white/[0.05] rounded-lg transition-colors">
            Clear session
          </button>
        </aside>

        {/* Chat */}
        <main className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className="max-w-[85%] rounded-xl px-4 py-3"
                  style={{
                    background: msg.role === 'user' ? 'rgba(201,168,76,0.1)' : 'rgba(255,255,255,0.04)',
                    border: msg.role === 'user' ? '1px solid rgba(201,168,76,0.25)' : '1px solid rgba(255,255,255,0.08)',
                    borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                  }}
                >
                  <MarkdownRenderer content={msg.content} />
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3">
                  <div className="flex gap-1 items-center">
                    {[0, 1, 2].map(d => (
                      <div key={d} className="w-1.5 h-1.5 rounded-full bg-[#C9A84C] animate-bounce" style={{ animationDelay: `${d * 0.15}s` }} />
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="border-t border-white/[0.07] px-6 py-4 bg-black/20 flex gap-3">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
              placeholder={`Ask the agent — audit a URL, create a page for ${activeSite.domain}, check rankings…`}
              disabled={loading}
              className="flex-1 bg-white/[0.05] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-gray-200 placeholder-gray-600 outline-none focus:border-[#C9A84C]/40 transition-colors"
            />
            <button
              onClick={handleSend}
              disabled={loading || !input.trim()}
              className="px-5 py-2.5 text-sm font-bold rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              style={{ background: 'linear-gradient(135deg, #C9A84C, #8B6914)', color: '#0D0F14' }}
            >
              Send
            </button>
          </div>

          {/* Phase approval gate */}
          {phaseState.phase && phaseState.status === 'ready' && (
            <div className="border-t border-[#4CC98E]/30 px-6 py-3 bg-[#4CC98E]/5 flex items-center justify-between">
              <span className="text-xs text-[#4CC98E]">
                <strong>{phaseState.phase.toUpperCase()}</strong> phase ready for approval
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const nextModuleId = getNextModuleAfterPhase(phaseState.phase!)
                    if (nextModuleId) {
                      setPhaseState({ phase: null, status: null })
                      handleModule(nextModuleId)
                    }
                  }}
                  className="bg-[#4CC98E] text-black text-xs font-bold px-4 py-1.5 rounded hover:bg-[#5ed59f] transition-colors"
                >
                  ✓ Approve & Continue
                </button>
                <button
                  onClick={() => setPhaseState({ phase: null, status: null })}
                  className="text-xs text-gray-500 hover:text-gray-300 transition-colors px-2"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

function MarkdownRenderer({ content }: { content: string }) {
  const lines = content.split('\n')
  const elements: React.ReactNode[] = []
  let i = 0
  let tableBuffer: string[] = []
  let inTable = false
  let codeBuffer: string[] = []
  let inCode = false
  let codeLang = ''

  const flushTable = (key: number) => {
    if (tableBuffer.length < 2) return
    const headers = tableBuffer[0].split('|').map(s => s.trim()).filter(Boolean)
    const rows = tableBuffer.slice(2).map(r => r.split('|').map(s => s.trim()).filter(Boolean))
    elements.push(
      <div key={key} className="overflow-x-auto my-3">
        <table className="text-xs border-collapse w-full">
          <thead>
            <tr>{headers.map((h, hi) => <th key={hi} className="px-3 py-2 bg-white/[0.06] text-[#C9A84C] text-left border-b border-white/10 whitespace-nowrap">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri} className="border-b border-white/[0.05]">
                {row.map((cell, ci) => <td key={ci} className="px-3 py-1.5 text-gray-300 align-top">{cell}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
    tableBuffer = []
    inTable = false
  }

  while (i < lines.length) {
    const line = lines[i]

    if (inCode) {
      if (line.startsWith('```')) {
        const isFile = codeLang.startsWith('file:')
        elements.push(
          <pre key={i} className="bg-black/40 border border-white/[0.08] rounded-lg p-3 overflow-x-auto text-[11px] text-[#a8d4ff] my-2 leading-relaxed">
            {isFile && <div className="text-[#C9A84C] text-[10px] mb-2 font-mono">{codeLang.replace('file:', '📄 ')}</div>}
            {codeBuffer.join('\n')}
          </pre>
        )
        codeBuffer = []
        inCode = false
        codeLang = ''
      } else {
        codeBuffer.push(line)
      }
      i++
      continue
    }

    if (line.startsWith('```')) {
      if (inTable) { flushTable(i); }
      inCode = true
      codeLang = line.slice(3).trim()
      i++
      continue
    }

    if (line.startsWith('|')) {
      inTable = true
      tableBuffer.push(line)
      i++
      continue
    } else if (inTable) {
      flushTable(i)
    }

    if (line.startsWith('### ')) {
      elements.push(<h3 key={i} className="text-[#C9A84C] text-sm font-bold mt-4 mb-1.5">{line.slice(4)}</h3>)
    } else if (line.startsWith('## ')) {
      elements.push(<h2 key={i} className="text-white text-sm font-bold mt-5 mb-2 border-b border-white/10 pb-1.5">{line.slice(3)}</h2>)
    } else if (line.startsWith('# ')) {
      elements.push(<h1 key={i} className="text-[#C9A84C] text-base font-bold mb-3">{line.slice(2)}</h1>)
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      elements.push(
        <div key={i} className="flex gap-2 my-0.5">
          <span className="text-[#C9A84C] shrink-0 mt-0.5">—</span>
          <span className="text-sm text-gray-300 leading-relaxed">{renderInline(line.slice(2))}</span>
        </div>
      )
    } else if (/^\d+\. /.test(line)) {
      const num = line.match(/^(\d+)\./)?.[1]
      elements.push(
        <div key={i} className="flex gap-2 my-0.5">
          <span className="text-[#C9A84C] shrink-0 font-mono text-xs mt-1">{num}.</span>
          <span className="text-sm text-gray-300 leading-relaxed">{renderInline(line.replace(/^\d+\. /, ''))}</span>
        </div>
      )
    } else if (line === '---') {
      elements.push(<hr key={i} className="border-white/[0.08] my-3" />)
    } else if (line.trim() === '') {
      elements.push(<div key={i} className="h-1.5" />)
    } else {
      elements.push(<p key={i} className="text-sm text-gray-300 leading-relaxed my-1">{renderInline(line)}</p>)
    }
    i++
  }
  if (inTable) flushTable(i)

  return <div>{elements}</div>
}

function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**'))
      return <strong key={i} className="text-[#e8d5a0] font-semibold">{part.slice(2, -2)}</strong>
    if (part.startsWith('`') && part.endsWith('`'))
      return <code key={i} className="bg-[#C9A84C]/15 text-[#C9A84C] px-1.5 py-0.5 rounded text-[11px] font-mono">{part.slice(1, -1)}</code>
    return part
  })
}
