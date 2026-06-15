import { NextRequest, NextResponse } from 'next/server'
import { getOctokit } from '@/lib/github'
import { SITES } from '@/lib/config'

export async function GET(req: NextRequest) {
  const token = req.headers.get('x-github-token') || undefined
  const octokit = getOctokit(token)

  const results = await Promise.all(
    SITES.map(async (site) => {
      const [owner, repoName] = site.repo.split('/')
      try {
        const { data } = await octokit.repos.get({ owner, repo: repoName })
        return { site: site.id, repo: site.repo, ok: true, push: !!data.permissions?.push }
      } catch (err) {
        return {
          site: site.id,
          repo: site.repo,
          ok: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        }
      }
    }),
  )

  return NextResponse.json({ results })
}
