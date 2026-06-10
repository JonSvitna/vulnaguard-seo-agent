import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { query } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const siteId = req.nextUrl.searchParams.get('siteId')
  const rows = siteId
    ? await query(
        `SELECT id, site_id, provider, title, created_at, updated_at
         FROM sessions WHERE site_id = $1 ORDER BY updated_at DESC LIMIT 50`,
        [siteId],
      )
    : await query(
        `SELECT id, site_id, provider, title, created_at, updated_at
         FROM sessions ORDER BY updated_at DESC LIMIT 50`,
      )
  return NextResponse.json({ sessions: rows })
}

export async function POST(req: NextRequest) {
  const { siteId, provider, title } = await req.json()
  if (!siteId) return NextResponse.json({ error: 'siteId is required' }, { status: 400 })
  const id = randomUUID()
  const rows = await query<{ id: string }>(
    `INSERT INTO sessions (id, site_id, provider, title) VALUES ($1, $2, $3, $4) RETURNING id`,
    [id, siteId, provider ?? null, title ?? null],
  )
  return NextResponse.json({ id: rows[0].id })
}
