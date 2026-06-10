import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { SEO_SYSTEM_PROMPT } from '@/lib/config'

type Provider = 'anthropic' | 'openai'

export async function POST(req: NextRequest) {
  const { messages, siteId, siteDomain, provider } = await req.json()

  const anthropicKey = process.env.ANTHROPIC_API_KEY
  const openaiKey = process.env.OPENAI_API_KEY

  const activeProvider: Provider | null =
    provider === 'openai' || provider === 'anthropic'
      ? provider
      : anthropicKey
        ? 'anthropic'
        : openaiKey
          ? 'openai'
          : null

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

    const stream = await client.messages.stream({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: systemPrompt,
      messages,
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
      },
    })

    return new NextResponse(readable, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
      },
    })
  }

  // OpenAI
  const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      max_tokens: 4096,
      stream: true,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
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
