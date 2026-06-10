import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface ResultInput {
  kind: string
  path?: string | null
  content: string
  status?: string
  siteId: string
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const items: ResultInput[] = Array.isArray(body?.results) ? body.results : [body]
  for (const r of items) {
    if (!r?.kind || typeof r.content !== 'string' || !r?.siteId) {
      return NextResponse.json({ error: 'kind, content, siteId required' }, { status: 400 })
    }
    await query(
      `INSERT INTO results (session_id, site_id, kind, path, content, status)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, r.siteId, r.kind, r.path ?? null, r.content, r.status ?? 'pending'],
    )
  }
  await query(`UPDATE sessions SET updated_at = NOW() WHERE id = $1`, [id])
  return NextResponse.json({ ok: true, count: items.length })
}
