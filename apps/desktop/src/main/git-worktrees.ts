import { execFile } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { basename, dirname, join, normalize } from 'node:path'
import type {
  CreatedWorktree,
  CreateTaskRequest,
  RemoveTaskRequest,
  RepoInfo,
  WorktreeSummary,
} from '../shared/git'

/** Branches Lenz creates for tasks live under this prefix. */
export const TASK_BRANCH_PREFIX = 'lenz/'

export class GitError extends Error {}

function git(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      ['-C', cwd, ...args],
      { windowsHide: true, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } },
      (error, stdout, stderr) => {
        if (error) {
          const detail = stderr.trim() || error.message
          reject(
            new GitError(
              (error as NodeJS.ErrnoException).code === 'ENOENT'
                ? 'No se encontró git en este equipo'
                : detail,
            ),
          )
        } else {
          resolve(stdout)
        }
      },
    )
  })
}

function lines(output: string): string[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

/** "Arreglar el login (v2)" → "arreglar-el-login-v2". */
export function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '')
}

/** Null when `path` is not inside a git repository. */
export async function repoInfo(path: string): Promise<RepoInfo | null> {
  let root: string
  try {
    root = normalize(lines(await git(path, ['rev-parse', '--show-toplevel']))[0] ?? '')
  } catch {
    return null
  }
  if (!root) return null
  const hasCommits = await git(root, ['rev-parse', '--verify', '--quiet', 'HEAD']).then(
    () => true,
    () => false,
  )
  const currentBranch = await git(root, ['symbolic-ref', '--quiet', '--short', 'HEAD']).then(
    (out) => lines(out)[0] ?? null,
    () => null,
  )
  const branches = hasCommits
    ? lines(await git(root, ['for-each-ref', '--format=%(refname:short)', 'refs/heads']))
    : []
  return { root, currentBranch: hasCommits ? currentBranch : null, branches, hasCommits }
}

/**
 * Creates a branch `lenz/<slug>` from `baseBranch` and checks it out in a
 * worktree beside the repository: `<repo>-worktrees/<slug>`.
 */
export async function createTaskWorktree(request: CreateTaskRequest): Promise<CreatedWorktree> {
  const info = await repoInfo(request.repoPath)
  if (!info) throw new GitError('Esta carpeta no es un repositorio git')
  if (!info.hasCommits)
    throw new GitError('El repositorio no tiene commits todavía; haz el primero y vuelve a intentar')
  if (!info.branches.includes(request.baseBranch)) {
    throw new GitError(`La rama base "${request.baseBranch}" no existe`)
  }

  const slug = slugify(request.name) || 'tarea'
  const parent = join(dirname(info.root), `${basename(info.root)}-worktrees`)
  const taken = new Set(info.branches)
  let suffix = 1
  let name = slug
  while (taken.has(`${TASK_BRANCH_PREFIX}${name}`) || existsSync(join(parent, name))) {
    suffix++
    name = `${slug}-${suffix}`
  }
  const branch = `${TASK_BRANCH_PREFIX}${name}`
  const path = join(parent, name)
  mkdirSync(parent, { recursive: true })
  await git(info.root, ['worktree', 'add', '-b', branch, path, request.baseBranch])
  return { path, branch }
}

export async function worktreeSummary(path: string, baseBranch: string): Promise<WorktreeSummary> {
  const changed = lines(await git(path, ['status', '--porcelain=v1', '--untracked-files=all'])).length
  const ahead = Number.parseInt(
    lines(await git(path, ['rev-list', '--count', `${baseBranch}..HEAD`]))[0] ?? '0',
    10,
  )
  return { changed, ahead: Number.isFinite(ahead) ? ahead : 0 }
}

/** Removes the worktree folder and, if asked, the task branch. */
export async function removeTaskWorktree(request: RemoveTaskRequest): Promise<void> {
  if (existsSync(request.path)) {
    await git(request.repoPath, ['worktree', 'remove', ...(request.force ? ['--force'] : []), request.path])
  } else {
    // Folder already gone (deleted by hand): drop git's record of it.
    await git(request.repoPath, ['worktree', 'prune'])
  }
  if (request.deleteBranch) {
    await git(request.repoPath, ['branch', '-D', request.branch])
  }
}
