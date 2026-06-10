import { NextRequest, NextResponse } from 'next/server'
import { writeRepoFile, listRepoFiles, getRepoFile } from '@/lib/github'

// Lets you check what this running instance actually sees, e.g. GET /api/github
export async function GET() {
  const token = process.env.GITHUB_TOKEN
  return NextResponse.json({
    githubTokenConfigured: !!token,
    githubTokenLength: token?.length ?? 0,
  })
}

export async function POST(req: NextRequest) {
  const { action, repo, path, content, message, branch } = await req.json()
  const token = req.headers.get('x-github-token') || undefined

  try {
    if (action === 'write') {
      const result = await writeRepoFile(repo, path, content, message || `SEO Agent: update ${path}`, branch, token)
      return NextResponse.json({ success: true, commit: result.commit?.sha })
    }
    if (action === 'list') {
      const files = await listRepoFiles(repo, path, branch, token)
      return NextResponse.json({ files })
    }
    if (action === 'read') {
      const file = await getRepoFile(repo, path, branch, token)
      return NextResponse.json({ file })
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'GitHub API error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
