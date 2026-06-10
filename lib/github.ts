import { Octokit } from '@octokit/rest'

export function getOctokit() {
  const token = process.env.GITHUB_TOKEN
  if (!token) throw new Error('GITHUB_TOKEN not set')
  return new Octokit({ auth: token })
}

export async function getRepoFile(repo: string, path: string, branch = 'main') {
  const [owner, repoName] = repo.split('/')
  const octokit = getOctokit()
  try {
    const { data } = await octokit.repos.getContent({ owner, repo: repoName, path, ref: branch })
    if ('content' in data) {
      return {
        content: Buffer.from(data.content, 'base64').toString('utf-8'),
        sha: data.sha,
      }
    }
    return null
  } catch {
    return null
  }
}

export async function writeRepoFile(
  repo: string,
  path: string,
  content: string,
  message: string,
  branch = 'main'
) {
  const [owner, repoName] = repo.split('/')
  const octokit = getOctokit()

  // Check if file exists to get SHA
  const existing = await getRepoFile(repo, path, branch)

  const params: Parameters<typeof octokit.repos.createOrUpdateFileContents>[0] = {
    owner,
    repo: repoName,
    path,
    message,
    content: Buffer.from(content).toString('base64'),
    branch,
  }
  if (existing?.sha) params.sha = existing.sha

  const { data } = await octokit.repos.createOrUpdateFileContents(params)
  return data
}

export async function listRepoFiles(repo: string, path: string, branch = 'main') {
  const [owner, repoName] = repo.split('/')
  const octokit = getOctokit()
  try {
    const { data } = await octokit.repos.getContent({ owner, repo: repoName, path, ref: branch })
    if (Array.isArray(data)) {
      return data.map((f) => ({ name: f.name, path: f.path, type: f.type }))
    }
    return []
  } catch {
    return []
  }
}

// Parse agent output for file blocks: ```file:path/to/file.tsx ... ```
export function parseFileBlocks(text: string): Array<{ path: string; content: string }> {
  const regex = /```file:([^\n]+)\n([\s\S]*?)```/g
  const files: Array<{ path: string; content: string }> = []
  let match
  while ((match = regex.exec(text)) !== null) {
    files.push({ path: match[1].trim(), content: match[2].trim() })
  }
  return files
}
