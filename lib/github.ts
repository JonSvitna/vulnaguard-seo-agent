import { Octokit } from '@octokit/rest'

function splitRepo(repo: string) {
  const [owner, repoName] = repo.split('/')
  if (!owner || !repoName) throw new Error('Invalid repo format. Expected owner/repo.')
  return { owner, repoName }
}

export function getOctokit(token?: string, requireAuth = false) {
  const resolved = token || process.env.GITHUB_TOKEN
  if (!resolved && requireAuth) {
    throw new Error('GITHUB_TOKEN not set. Add it in Settings or set the GITHUB_TOKEN env var.')
  }
  return resolved ? new Octokit({ auth: resolved }) : new Octokit()
}

export async function getRepoFile(repo: string, path: string, branch = 'main', token?: string) {
  const { owner, repoName } = splitRepo(repo)
  const octokit = getOctokit(token, false)
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
  branch = 'main',
  token?: string
) {
  const { owner, repoName } = splitRepo(repo)
  const octokit = getOctokit(token, true)

  const existing = await getRepoFile(repo, path, branch, token)

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

export async function listRepoFiles(repo: string, path: string, branch = 'main', token?: string) {
  const { owner, repoName } = splitRepo(repo)
  const octokit = getOctokit(token, false)
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

export async function batchWriteRepoFiles(
  repo: string,
  files: Array<{ path: string; content: string }>,
  messageSuffix?: string,
  branch = 'main',
  token?: string
) {
  const results = await Promise.all(
    files.map(f =>
      writeRepoFile(
        repo,
        f.path,
        f.content,
        `SEO Agent: add/update ${f.path}${messageSuffix ? ` (${messageSuffix})` : ''}`,
        branch,
        token
      )
    )
  )
  return results
}

export async function writeRepoFilesSingleCommit(
  repo: string,
  files: Array<{ path: string; content: string }>,
  message: string,
  branch = 'main',
  token?: string
) {
  if (!files.length) throw new Error('No files provided for batch write.')

  const { owner, repoName } = splitRepo(repo)
  const octokit = getOctokit(token, true)

  // Deduplicate paths so the last file content wins when duplicates appear.
  const deduped = new Map<string, string>()
  for (const file of files) {
    if (!file.path || typeof file.content !== 'string') continue
    deduped.set(file.path, file.content)
  }
  if (!deduped.size) throw new Error('No valid files provided for batch write.')

  const ref = await octokit.git.getRef({ owner, repo: repoName, ref: `heads/${branch}` })
  const headSha = ref.data.object.sha
  const headCommit = await octokit.git.getCommit({ owner, repo: repoName, commit_sha: headSha })

  const tree = await Promise.all(
    Array.from(deduped.entries()).map(async ([path, content]) => {
      const blob = await octokit.git.createBlob({
        owner,
        repo: repoName,
        content,
        encoding: 'utf-8',
      })
      return {
        path,
        mode: '100644' as const,
        type: 'blob' as const,
        sha: blob.data.sha,
      }
    }),
  )

  const newTree = await octokit.git.createTree({
    owner,
    repo: repoName,
    base_tree: headCommit.data.tree.sha,
    tree,
  })

  const commit = await octokit.git.createCommit({
    owner,
    repo: repoName,
    message,
    tree: newTree.data.sha,
    parents: [headSha],
  })

  await octokit.git.updateRef({
    owner,
    repo: repoName,
    ref: `heads/${branch}`,
    sha: commit.data.sha,
    force: false,
  })

  return { commitSha: commit.data.sha, fileCount: tree.length }
}

export async function listRepoTreePaths(
  repo: string,
  branch = 'main',
  token?: string,
  prefix?: string,
) {
  const { owner, repoName } = splitRepo(repo)
  const octokit = getOctokit(token, false)
  const ref = await octokit.git.getRef({ owner, repo: repoName, ref: `heads/${branch}` })
  const headSha = ref.data.object.sha
  const headCommit = await octokit.git.getCommit({ owner, repo: repoName, commit_sha: headSha })
  const treeRes = await octokit.git.getTree({
    owner,
    repo: repoName,
    tree_sha: headCommit.data.tree.sha,
    recursive: '1',
  })

  const normalizedPrefix = (prefix || '').replace(/^\/+|\/+$/g, '')
  return (treeRes.data.tree || [])
    .filter((item) => item.type === 'blob' && !!item.path)
    .map((item) => item.path as string)
    .filter((path) =>
      normalizedPrefix
        ? path === normalizedPrefix || path.startsWith(`${normalizedPrefix}/`)
        : true,
    )
}
