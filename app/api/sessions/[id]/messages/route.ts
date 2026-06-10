import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { role, content } = await req.json()
  if (role !== 'user' && role !== 'assistant') {
    return NextResponse.json({ error: 'role must be user or assistant' }, { status: 400 })
  }
  if (typeof content !== 'string') {
    return NextResponse.json({ error: 'content must be a string' }, { status: 400 })
  }
  await query(
    `INSERT INTO messages (session_id, role, content) VALUES ($1, $2, $3)`,
    [id, role, content],
  )
  await query(`UPDATE sessions SET updated_at = NOW() WHERE id = $1`, [id])
  return NextResponse.json({ ok: true })
}
