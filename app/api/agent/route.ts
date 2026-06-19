import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { SEO_SYSTEM_PROMPT } from '@/lib/config'
import { getProviderForAgent } from '@/lib/ai-provider'

type Provider = 'anthropic' | 'openai'

export async function POST(req: NextRequest) {
  const { messages, siteId, siteDomain, provider, moduleId } = await req.json()

  const headerKey = req.headers.get('x-ai-key') || undefined

  // A module run (M1-M6) is configured per-module in Settings — that config
  // dictates provider+model, overriding the dashboard's provider toggle.
  // Plain chat (no moduleId) keeps the old toggle-driven behavior.
  let activeProvider: Provider | null
  let model: string
  if (moduleId && moduleId >= 1 && moduleId <= 6) {
    const config = await getProviderForAgent(`seo-m${moduleId}`)
    activeProvider = config.provider === 'claude' ? 'anthropic' : 'openai'
    model = config.model
  } else {
    activeProvider =
      provider === 'openai' || provider === 'anthropic'
        ? provider
        : process.env.ANTHROPIC_API_KEY
          ? 'anthropic'
          : process.env.OPENAI_API_KEY
            ? 'openai'
            : null
    model = activeProvider === 'anthropic' ? 'claude-haiku-4-5-20251001' : 'gpt-4.1'
  }

  const anthropicKey = (activeProvider === 'anthropic' ? headerKey : undefined) || process.env.ANTHROPIC_API_KEY
  const openaiKey = (activeProvider === 'openai' ? headerKey : undefined) || process.env.OPENAI_API_KEY

  if (!activeProvider) {
    return NextResponse.json({ error: 'No AI provider configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.' }, { status: 500 })
  }
  if (activeProvider === 'anthropic' && !anthropicKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 })
  }
  if (activeProvider === 'openai' && !openaiKey) {
    return NextResponse.json({ error: 'OPENAI_API_KEY not set' }, { status: 500 })
  }

  const systemPrompt = `${SEO_SYSTEM_PROMPT}

CURRENT ACTIVE SITE: ${siteDomain || 'vulnaguard.com'} (${siteId || 'vulnaguard'})`

  const encoder = new TextEncoder()

  if (activeProvider === 'anthropic') {
    const client = new Anthropic({ apiKey: anthropicKey })

    // Mark the last message before the newest user turn as a cache breakpoint,
    // so system + prior history can be served from cache on turns 2+.
    const cachedMessages = [...messages]
    const breakpointIdx = cachedMessages.length - 2
    if (breakpointIdx >= 0) {
      const target = cachedMessages[breakpointIdx]
      cachedMessages[breakpointIdx] = {
        ...target,
        content: [{ type: 'text', text: target.content, cache_control: { type: 'ephemeral' } }],
      }
    }

    const stream = await client.messages.stream({
      model,
      max_tokens: 16000,
      system: systemPrompt,
      messages: cachedMessages,
    })

    const readable = new ReadableStream({
      async start(controller) {
        for await (const chunk of stream) {
          if (
            chunk.type === 'content_block_delta' &&
            chunk.delta.type === 'text_delta'
          ) {
            controller.enqueue(encoder.encode(chunk.delta.text))
          }
        }
        controller.close()

        const { usage } = await stream.finalMessage()
        console.log('[agent] usage', {
          input_tokens: usage.input_tokens,
          cache_creation_input_tokens: usage.cache_creation_input_tokens,
          cache_read_input_tokens: usage.cache_read_input_tokens,
          output_tokens: usage.output_tokens,
        })
      },
    })

    return new NextResponse(readable, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
      },
    })
  }

  // OpenAI — cap history to last 6 turns to stay within free-tier TPM limits
  const trimmedMessages = messages.slice(-6)
  const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 16384,
      stream: true,
      messages: [{ role: 'system', content: systemPrompt }, ...trimmedMessages],
    }),
  })

  if (!openaiRes.ok || !openaiRes.body) {
    const errText = await openaiRes.text().catch(() => '')
    return NextResponse.json({ error: `OpenAI API error (${openaiRes.status}): ${errText}` }, { status: 500 })
  }

  const readable = new ReadableStream({
    async start(controller) {
      const reader = openaiRes.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data:')) continue
          const data = trimmed.slice(5).trim()
          if (data === '[DONE]') continue

          try {
            const parsed = JSON.parse(data)
            const text = parsed.choices?.[0]?.delta?.content
            if (text) controller.enqueue(encoder.encode(text))
          } catch {
            // ignore malformed/partial SSE chunks
          }
        }
      }
      controller.close()
    },
  })

  return new NextResponse(readable, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
    },
  })
}
