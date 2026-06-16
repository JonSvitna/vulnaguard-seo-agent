'use client'

import { useState, useEffect } from 'react'
import { SITES } from '@/lib/config'

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

interface AIProviderRow { agent_name: string; provider: string; model: string }

const AGENT_LABELS: Record<string, string> = {
  default: 'Global Default',
  scout: 'Lead Extractor',
  qualifier: 'Lead Qualifier',
  copywriter: 'Email Copywriter',
  'content-pipeline': 'Content Pipeline',
}

const OPENAI_MODELS = ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini']
const CLAUDE_MODELS = ['claude-sonnet-4-6', 'claude-haiku-4-5-20251001', 'claude-opus-4-8']

export default function Settings() {
  const [values, setValues] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)
  const [dbStatus, setDbStatus] = useState<{ ok: boolean; error?: string } | null>(null)
  const [githubHealth, setGithubHealth] = useState<Array<{ site: string; repo: string; ok: boolean; push?: boolean; error?: string }> | null>(null)
  const [aiConfig, setAiConfig] = useState<AIProviderRow[]>([])
  const [aiSaving, setAiSaving] = useState<string | null>(null)

  // Load from localStorage on mount
  useEffect(() => {
    const loaded: Record<string, string> = {}
    SETTINGS.forEach(s => {
      const v = localStorage.getItem(s.key)
      if (v) loaded[s.key] = v
    })
    setValues(loaded)
  }, [])

  useEffect(() => {
    fetch('/api/settings/ai-provider')
      .then(res => res.json())
      .then(data => {
        const rows: AIProviderRow[] = data.configs ?? []
        const agentNames = ['default', 'scout', 'qualifier', 'copywriter', 'content-pipeline']
        const merged = agentNames.map(name => rows.find(r => r.agent_name === name) ?? { agent_name: name, provider: 'openai', model: 'gpt-4o' })
        setAiConfig(merged)
      })
      .catch(() => {})
  }, [])

  const handleAiProviderChange = async (agentName: string, field: 'provider' | 'model', value: string) => {
    const updated = aiConfig.map(r => {
      if (r.agent_name !== agentName) return r
      const next = { ...r, [field]: value }
      if (field === 'provider') {
        next.model = value === 'openai' ? 'gpt-4o' : 'claude-sonnet-4-6'
      }
      return next
    })
    setAiConfig(updated)
    setAiSaving(agentName)
    const row = updated.find(r => r.agent_name === agentName)!
    await fetch('/api/settings/ai-provider', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(row),
    }).catch(() => {})
    setAiSaving(null)
  }

  useEffect(() => {
    fetch('/api/health/db')
      .then(res => res.json())
      .then(data => setDbStatus(data))
      .catch(err => setDbStatus({ ok: false, error: err instanceof Error ? err.message : 'Unknown error' }))
  }, [])

  useEffect(() => {
    const githubToken = localStorage.getItem('GITHUB_TOKEN') || undefined
    fetch('/api/github/health', {
      headers: githubToken ? { 'X-GitHub-Token': githubToken } : {},
    })
      .then(res => res.json())
      .then(data => setGithubHealth(data.results))
      .catch(() => setGithubHealth(null))
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
    <div className="min-h-full bg-[#0D0F14] text-white font-sans">
      <header className="flex items-center justify-end px-6 py-3 border-b border-white/[0.07] bg-black/30">
        <span className="text-[10px] text-[#C9A84C] tracking-[0.15em] uppercase">Agent Settings</span>
      </header>

      <div className="max-w-2xl mx-auto px-6 py-10">
        <h1 className="text-xl font-bold mb-1">API Configuration</h1>
        <p className="text-sm text-gray-500 mb-8">
          Keys are saved in your browser and sent securely with each request. They are never stored on the server.{' '}
          For server-side defaults, set environment variables on{' '}
          <a href="https://railway.app" target="_blank" rel="noopener" className="text-[#C9A84C] hover:underline">Railway</a>.
        </p>

        {/* DB persistence status */}
        <div className="mb-6 bg-white/[0.03] border border-white/[0.08] rounded-xl p-5 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-white">Session Persistence (Database)</div>
            <p className="text-xs text-gray-500 mt-0.5">
              {dbStatus === null
                ? 'Checking connection…'
                : dbStatus.ok
                  ? 'Connected — sessions and scan results are saved.'
                  : `Connection failed — sessions will not be saved. ${dbStatus.error ?? ''}`}
            </p>
          </div>
          <span
            className="text-[10px] font-bold px-2 py-1 rounded shrink-0 ml-4"
            style={{
              color: dbStatus === null ? '#666' : dbStatus.ok ? '#4CC98E' : '#C94C4C',
              background: dbStatus === null ? 'rgba(255,255,255,0.05)' : dbStatus.ok ? 'rgba(76,201,142,0.1)' : 'rgba(201,76,76,0.1)',
              border: `1px solid ${dbStatus === null ? 'rgba(255,255,255,0.1)' : dbStatus.ok ? 'rgba(76,201,142,0.3)' : 'rgba(201,76,76,0.3)'}`,
            }}
          >
            {dbStatus === null ? 'CHECKING' : dbStatus.ok ? 'CONNECTED' : 'ERROR'}
          </span>
        </div>

        {/* GitHub connection status */}
        <div className="mb-6 bg-white/[0.03] border border-white/[0.08] rounded-xl p-5">
          <div className="text-sm font-semibold text-white mb-3">GitHub Connections</div>
          <div className="space-y-2">
            {githubHealth === null ? (
              <p className="text-xs text-gray-500">Checking connections…</p>
            ) : (
              githubHealth.map(result => {
                const site = SITES.find(s => s.id === result.site)
                const ok = result.ok && result.push
                return (
                  <div key={result.site} className="flex items-center justify-between">
                    <div>
                      <div className="text-xs text-white">{site?.name ?? result.site} <span className="text-gray-500">({result.repo})</span></div>
                      {!ok && (
                        <p className="text-xs text-gray-500 mt-0.5">
                          {result.error ?? 'Token does not have push access to this repo.'}
                        </p>
                      )}
                    </div>
                    <span
                      className="text-[10px] font-bold px-2 py-1 rounded shrink-0 ml-4"
                      style={{
                        color: ok ? '#4CC98E' : '#C94C4C',
                        background: ok ? 'rgba(76,201,142,0.1)' : 'rgba(201,76,76,0.1)',
                        border: `1px solid ${ok ? 'rgba(76,201,142,0.3)' : 'rgba(201,76,76,0.3)'}`,
                      }}
                    >
                      {ok ? 'CONNECTED' : 'ERROR'}
                    </span>
                  </div>
                )
              })
            )}
          </div>
        </div>

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

        {/* AI Provider */}
        <div className="mt-10 bg-white/[0.02] border border-white/[0.06] rounded-xl p-6">
          <h2 className="text-sm font-bold text-[#C9A84C] mb-1">AI Provider</h2>
          <p className="text-xs text-gray-500 mb-4">
            OpenAI is the default. Override per agent or change the global default. Per-agent rows inherit the global default if not set.
          </p>
          <div className="space-y-3">
            {aiConfig.map(row => {
              const models = row.provider === 'openai' ? OPENAI_MODELS : CLAUDE_MODELS
              const isDefault = row.agent_name === 'default'
              return (
                <div key={row.agent_name} className="flex items-center gap-3">
                  <div className="w-36 shrink-0">
                    <div className="text-xs font-semibold text-white">{AGENT_LABELS[row.agent_name] ?? row.agent_name}</div>
                    {isDefault && <div className="text-[10px] text-gray-500">All agents inherit this</div>}
                  </div>
                  <div className="flex gap-2 flex-1">
                    <div className="flex rounded-lg overflow-hidden border border-white/10 shrink-0">
                      {(['openai', 'claude'] as const).map(p => (
                        <button
                          key={p}
                          onClick={() => handleAiProviderChange(row.agent_name, 'provider', p)}
                          className="px-3 py-1.5 text-[11px] font-bold transition-colors"
                          style={{
                            background: row.provider === p ? (p === 'openai' ? 'rgba(76,201,142,0.15)' : 'rgba(201,168,76,0.15)') : 'transparent',
                            color: row.provider === p ? (p === 'openai' ? '#4CC98E' : '#C9A84C') : '#555',
                          }}
                        >
                          {p === 'openai' ? 'OpenAI' : 'Claude'}
                        </button>
                      ))}
                    </div>
                    <select
                      value={row.model}
                      onChange={e => handleAiProviderChange(row.agent_name, 'model', e.target.value)}
                      className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-xs font-mono text-gray-300 outline-none focus:border-[#C9A84C]/40"
                    >
                      {models.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                  {aiSaving === row.agent_name && (
                    <span className="text-[10px] text-gray-500 shrink-0">saving…</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* GSC Setup Guide */}
        <div className="mt-10 bg-white/[0.02] border border-white/[0.06] rounded-xl p-6">
          <h2 className="text-sm font-bold text-[#C9A84C] mb-3">Google Search Console Setup</h2>
          <ol className="space-y-2">
            {[
              'Go to Google Cloud Console → Create or select a project',
              'Enable the Search Console API',
              'Go to Credentials → Create OAuth 2.0 Client ID (Web application type) — add https://developers.google.com/oauthplayground as an authorized redirect URI',
              'Copy the Client ID and Client Secret, paste them in the fields above',
              'Go to developers.google.com/oauthplayground → click the gear icon → check "Use your own OAuth credentials" → paste your Client ID and Secret',
              'In the left panel, find "Webmaster Tools v2" (this is the Search Console API\'s legacy listing) — or paste https://www.googleapis.com/auth/webmasters.readonly into "Input your own scopes" at the bottom — then click Authorize APIs and sign in with the account that has access to your GSC property',
              'Click "Exchange authorization code for tokens" and copy the Refresh token into the field above',
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
