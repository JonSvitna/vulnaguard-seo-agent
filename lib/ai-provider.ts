import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import { query } from './db'

export type AIProvider = 'openai' | 'claude'

export interface ProviderConfig {
  provider: AIProvider
  model: string
}

export async function getProviderForAgent(agentName: string): Promise<ProviderConfig> {
  const rows = await query<{ provider: string; model: string }>(
    `SELECT provider, model FROM ai_provider_config WHERE agent_name = $1`,
    [agentName]
  )
  if (rows.length) return { provider: rows[0].provider as AIProvider, model: rows[0].model }

  const defaults = await query<{ provider: string; model: string }>(
    `SELECT provider, model FROM ai_provider_config WHERE agent_name = 'default'`
  )
  if (defaults.length) return { provider: defaults[0].provider as AIProvider, model: defaults[0].model }

  return { provider: 'openai', model: 'gpt-4o' }
}

export function makeOpenAIClient(): OpenAI {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
}

export function makeAnthropicClient(): Anthropic {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
}

export function detectProviderFromEnv(): ProviderConfig {
  if (process.env.OPENAI_API_KEY) return { provider: 'openai', model: 'gpt-4.1' }
  return { provider: 'claude', model: 'claude-sonnet-4-6' }
}
