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
  return match ? { phase: match[1], status: match[2] } : null
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
  const [deployStatus, setDeployStatus] = useState<{ type: 'info' | 'success' | 'error'; message: string } | null>(null)
  const [blogs, setBlogs] = useState(0)
  const [services, setServices] = useState(0)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const conversationRef = useRef<Message[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)
  const sessionIdRef = useRef<string | null>(null)

  useEffect(() => { sessionIdRef.current = sessionId }, [sessionId])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const getStoredKeys = () => ({
    githubToken: typeof window !== 'undefined' ? localStorage.getItem('GITHUB_TOKEN') || undefined : undefined,
    aiKey: typeof window !== 'undefined' ? localStorage.getItem(provider === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY') || undefined : undefined,
  })

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

  // Load most recent session + inventory baseline whenever the active site changes
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const sessRes = await fetch(`/api/sessions?siteId=${encodeURIComponent(activeSite.id)}`)
        if (cancelled) return
        const sessJson = sessRes.ok ? await sessRes.json() : { sessions: [] }
        await refreshInventoryBaseline(activeSite)
        if (cancelled) return
        const latest = sessJson.sessions?.[0]
        if (latest) {
          const detailRes = await fetch(`/api/sessions/${latest.id}`)
          if (detailRes.ok && !cancelled) {
            const detail = await detailRes.json()
            const restored: Message[] = (detail.messages ?? []).map((m: { role: 'user' | 'assistant'; content: string }) => ({ role: m.role, content: m.content }))
            conversationRef.current = restored
            setSessionId(latest.id)
            if (restored.length > 0) setMessages(restored)
          }
        } else {
          setSessionId(null)
          conversationRef.current = []
        }
      } catch { /* persistence is best-effort */ }
    })()
    return () => { cancelled = true }
  }, [activeSite, refreshInventoryBaseline])

  const ensureSession = useCallback(async (): Promise<string | null> => {
    if (sessionIdRef.current) return sessionIdRef.current
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId: activeSite.id, provider }),
      })
      if (!res.ok) return null
      const { id } = await res.json()
      sessionIdRef.current = id
      setSessionId(id)
      return id
    } catch { return null }
  }, [activeSite.id, provider])

  const persistMessage = useCallback(async (sid: string, role: 'user' | 'assistant', content: string) => {
    try {
      await fetch(`/api/sessions/${sid}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, content }),
      })
    } catch { /* best-effort */ }
  }, [])

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
          }).catch(() => {})
        }
      }
      
      if (files.length > 0) {
        setPendingFiles(files)
        if (sid) {
          fetch(`/api/sessions/${sid}/results`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              results: files.map(f => ({
                kind: 'file', path: f.path, content: f.content, status: 'pending', siteId: activeSite.id,
              })),
            }),
          }).catch(() => {})
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
  }, [activeSite, provider, ensureSession, persistMessage])

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
        }).catch(() => {})
      }

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
    setActiveModule(null)
  }

  return (
    <div className="flex flex-col h-screen bg-[#0D0F14] text-white font-sans">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-white/[0.07] bg-black/30 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-md bg-gradient-to-br from-[#C9A84C] to-[#8B6914] flex items-center justify-center text-sm font-bold text-black">
            ⬡
          </div>
          <div>
            <div className="text-sm font-bold tracking-wide">VULNAGUARD</div>
            <div className="text-[10px] text-[#C9A84C] tracking-[0.15em] uppercase">SEO Intelligence Agent</div>
          </div>
        </div>

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

          <a href="/settings" className="bg-white/5 border border-white/10 rounded-md px-3 py-1.5 text-xs text-gray-400 hover:text-white transition-colors">
            ⚙ Settings
          </a>

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
