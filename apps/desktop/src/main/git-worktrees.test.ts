import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { createTaskWorktree, removeTaskWorktree, repoInfo, slugify, worktreeSummary } from './git-worktrees'

// realpath: on macOS the temp dir is a symlink and git reports the resolved path.
const sandbox = realpathSync(mkdtempSync(join(tmpdir(), 'lenz-git-')))
const repo = join(sandbox, 'demo')

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', ['-c', 'user.name=Lenz Test', '-c', 'user.email=test@lenz.dev', ...args], {
    cwd,
    encoding: 'utf8',
  })
}

mkdirSync(repo)
git(repo, 'init', '-q', '-b', 'main')
writeFileSync(join(repo, 'README.md'), '# demo\n')
git(repo, 'add', '.')
git(repo, 'commit', '-q', '-m', 'first')

afterAll(() => rmSync(sandbox, { recursive: true, force: true }))

describe('git worktrees', () => {
  it('slugifies task names', () => {
    expect(slugify('Arreglar el Login (v2)!')).toBe('arreglar-el-login-v2')
    expect(slugify('  ñandú  ')).toBe('nandu')
    expect(slugify('***')).toBe('')
  })

  it('reports repository info', async () => {
    const info = await repoInfo(repo)
    expect(info).toMatchObject({ currentBranch: 'main', branches: ['main'], hasCommits: true })
    expect(await repoInfo(sandbox)).toBeNull()
  })

  it('creates, summarizes and removes a task worktree', async () => {
    const task = await createTaskWorktree({ repoPath: repo, name: 'Arreglar login', baseBranch: 'main' })
    expect(task.branch).toBe('lenz/arreglar-login')
    expect(task.path).toBe(join(sandbox, 'demo-worktrees', 'arreglar-login'))
    expect(existsSync(join(task.path, 'README.md'))).toBe(true)

    // Same name again gets a fresh branch and folder.
    const second = await createTaskWorktree({ repoPath: repo, name: 'Arreglar login', baseBranch: 'main' })
    expect(second.branch).toBe('lenz/arreglar-login-2')

    writeFileSync(join(task.path, 'fix.txt'), 'fix\n')
    expect(await worktreeSummary(task.path, 'main')).toEqual({ changed: 1, ahead: 0 })
    git(task.path, 'add', '.')
    git(task.path, 'commit', '-q', '-m', 'fix')
    expect(await worktreeSummary(task.path, 'main')).toEqual({ changed: 0, ahead: 1 })

    // Uncommitted changes block removal unless forced.
    writeFileSync(join(second.path, 'wip.txt'), 'wip\n')
    await expect(
      removeTaskWorktree({
        repoPath: repo,
        path: second.path,
        branch: second.branch,
        deleteBranch: true,
        force: false,
      }),
    ).rejects.toThrow()
    await removeTaskWorktree({
      repoPath: repo,
      path: second.path,
      branch: second.branch,
      deleteBranch: true,
      force: true,
    })
    expect(existsSync(second.path)).toBe(false)

    // Keeping the branch leaves the work reachable after the folder is gone.
    await removeTaskWorktree({
      repoPath: repo,
      path: task.path,
      branch: task.branch,
      deleteBranch: false,
      force: false,
    })
    expect(existsSync(task.path)).toBe(false)
    expect(git(repo, 'branch', '--list', 'lenz/*')).toContain('lenz/arreglar-login')
    expect(git(repo, 'branch', '--list', 'lenz/*')).not.toContain('arreglar-login-2')
  }, 30_000)

  it('rejects a missing base branch', async () => {
    await expect(createTaskWorktree({ repoPath: repo, name: 'x', baseBranch: 'nope' })).rejects.toThrow(
      'no existe',
    )
  })
})
