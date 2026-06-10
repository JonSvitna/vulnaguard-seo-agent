import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params
  await query(
    `INSERT INTO inventory (site_id, blogs, services, updated_at)
     VALUES ($1, 0, 0, NOW())
     ON CONFLICT (site_id) DO NOTHING`,
    [siteId],
  )
  const rows = await query<{ blogs: number; services: number }>(
    `SELECT blogs, services FROM inventory WHERE site_id = $1`,
    [siteId],
  )
  if (!rows.length) return NextResponse.json({ blogs: 0, services: 0 })
  return NextResponse.json(rows[0])
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params
  const { blogs, services } = await req.json()
  const b = Number.isFinite(blogs) ? Math.max(0, Math.floor(blogs)) : 0
  const s = Number.isFinite(services) ? Math.max(0, Math.floor(services)) : 0
  await query(
    `INSERT INTO inventory (site_id, blogs, services, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (site_id) DO UPDATE
       SET blogs = EXCLUDED.blogs,
           services = EXCLUDED.services,
           updated_at = NOW()`,
    [siteId, b, s],
  )
  return NextResponse.json({ ok: true })
}
