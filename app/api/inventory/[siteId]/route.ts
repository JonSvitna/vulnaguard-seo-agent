import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { listRepoTreePaths } from '@/lib/github'


function countInventoryFromPaths(paths: string[]) {
  const isBlog = (path: string) => /(^|\/)app\/blog\/[^/]+\/page\.(tsx|ts|jsx|js|mdx?)$/i.test(path)
  const isService = (path: string) => {
    if (!/(^|\/)app\/[^/]+\/page\.(tsx|ts|jsx|js|mdx?)$/i.test(path)) return false
    const segment = path.split('/')[1]?.toLowerCase()
    return !['api', 'blog', 'dashboard', 'settings'].includes(segment || '')
  }

  return {
    blogs: paths.filter(isBlog).length,
    services: paths.filter(isService).length,
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params
  const scan = req.nextUrl.searchParams.get('scan') === '1'
  const repo = req.nextUrl.searchParams.get('repo') || undefined
  const branch = req.nextUrl.searchParams.get('branch') || 'main'
  const contentPath = req.nextUrl.searchParams.get('contentPath') || 'app'

  if (scan && repo) {
    try {
      const token = req.headers.get('x-github-token') || undefined
      const paths = await listRepoTreePaths(repo, branch, token, contentPath)
      const counts = countInventoryFromPaths(paths)
      await query(
        `INSERT INTO inventory (site_id, blogs, services, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (site_id) DO UPDATE
           SET blogs = EXCLUDED.blogs,
               services = EXCLUDED.services,
               updated_at = NOW()`,
        [siteId, counts.blogs, counts.services],
      )
      return NextResponse.json({ ...counts, scanned: true })
    } catch {
      // Fall through to cached DB counts if scan fails.
    }
  }

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
