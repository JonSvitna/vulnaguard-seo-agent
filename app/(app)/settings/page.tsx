'use client'

import { useState, useEffect } from 'react'

interface Setting { key: string; label: string; placeholder: string; help: string; link?: string }

const SETTINGS: Setting[] = [
  {
    key: 'ANTHROPIC_API_KEY',
    label: 'Anthropic API Key',
    placeholder: 'sk-ant-...',
    help: 'Powers the lead qualifier and email copywriter (Claude models).',
    link: 'https://console.anthropic.com/keys',
  },
  {
    key: 'OPENAI_API_KEY',
    label: 'OpenAI API Key',
    placeholder: 'sk-...',
    help: 'Optional alternative provider — switch agents to GPT models below.',
    link: 'https://platform.openai.com/api-keys',
  },
  {
    key: 'RESEND_API_KEY',
    label: 'Resend API Key',
    placeholder: 're_...',
    help: 'Sends outreach email. Set this on the server (Railway) for live sending.',
    link: 'https://resend.com/api-keys',
  },
]

interface AIProviderRow { agent_name: string; provider: string; model: string }

const AGENT_LABELS: Record<string, string> = {
  default: 'Global Default',
  scout: 'Lead Extractor',
  qualifier: 'Lead Qualifier',
  copywriter: 'Email Copywriter',
}

const OPENAI_MODELS = ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini']
const CLAUDE_MODELS = ['claude-sonnet-4-6', 'claude-haiku-4-5-20251001', 'claude-opus-4-8']

export default function Settings() {
  const [values, setValues] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)
  const [dbStatus, setDbStatus] = useState<{ ok: boolean; error?: string } | null>(null)
  const [aiConfig, setAiConfig] = useState<AIProviderRow[]>([])
  const [aiSaving, setAiSaving] = useState<string | null>(null)
  const [resendConfigured, setResendConfigured] = useState<boolean | null>(null)

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
        const agentNames = ['default', 'scout', 'qualifier', 'copywriter']
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
    fetch('/api/marketing/config')
      .then(res => res.json())
      .then(data => setResendConfigured(!!data.resend_configured))
      .catch(() => setResendConfigured(false))
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
        <span className="text-[10px] text-[#C9A84C] tracking-[0.15em] uppercase">Settings</span>
      </header>

      <div className="max-w-2xl mx-auto px-6 py-10">
        <h1 className="text-xl font-bold mb-1">API Configuration</h1>
        <p className="text-sm text-gray-500 mb-8">
          Keys are saved in your browser and sent securely with each request. They are never stored on the server.{' '}
          For server-side defaults (and live email sending), set environment variables on{' '}
          <a href="https://railway.app" target="_blank" rel="noopener" className="text-[#C9A84C] hover:underline">Railway</a>.
        </p>

        {/* DB persistence status */}
        <div className="mb-6 bg-white/[0.03] border border-white/[0.08] rounded-xl p-5 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-white">Database Connection</div>
            <p className="text-xs text-gray-500 mt-0.5">
              {dbStatus === null
                ? 'Checking connection…'
                : dbStatus.ok
                  ? 'Connected — leads, sequences, and send history are saved.'
                  : `Connection failed — nothing will persist. ${dbStatus.error ?? ''}`}
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

        <div className="space-y-5">
          {SETTINGS.map(s => (
            <div key={s.key} className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-5">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <label className="text-sm font-semibold text-white">{s.label}</label>
                  <p className="text-xs text-gray-500 mt-0.5">{s.help}</p>
                  {s.key === 'RESEND_API_KEY' && (
                    <p className="text-[10px] mt-1 font-bold" style={{ color: resendConfigured === null ? '#666' : resendConfigured ? '#4CC98E' : '#C94C4C' }}>
                      {resendConfigured === null ? 'CHECKING SERVER…' : resendConfigured ? '● LIVE ON SERVER (Railway)' : '● NOT SET ON SERVER — emails will not send'}
                    </p>
                  )}
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
            {saved ? '✓ Saved to browser' : 'Save Keys'}
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
      </div>
    </div>
  )
}
