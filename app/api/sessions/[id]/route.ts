import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const sessions = await query(
    `SELECT id, site_id, provider, title, created_at, updated_at FROM sessions WHERE id = $1`,
    [id],
  )
  if (!sessions.length) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const messages = await query(
    `SELECT role, content, created_at FROM messages WHERE session_id = $1 ORDER BY id ASC`,
    [id],
  )
  const results = await query(
    `SELECT id, kind, path, content, status, created_at FROM results WHERE session_id = $1 ORDER BY id ASC`,
    [id],
  )
  return NextResponse.json({ session: sessions[0], messages, results })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await query(`DELETE FROM sessions WHERE id = $1`, [id])
  return NextResponse.json({ ok: true })
}
