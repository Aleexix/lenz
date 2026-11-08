import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { inheritClaudeTrust, trustKey } from './claude-trust'

const dir = mkdtempSync(join(tmpdir(), 'lenz-trust-'))
const file = join(dir, '.claude.json')
afterAll(() => rmSync(dir, { recursive: true, force: true }))

const repo = process.platform === 'win32' ? 'C:\\code\\app' : '/code/app'
const worktree = process.platform === 'win32' ? 'C:\\code\\app-worktrees\\fix' : '/code/app-worktrees/fix'

function projects(): Record<string, { hasTrustDialogAccepted?: boolean; other?: number }> {
  return JSON.parse(readFileSync(file, 'utf8')).projects
}

describe('Claude folder trust', () => {
  it('uses forward slashes on Windows', () => {
    expect(trustKey('C:\\code\\app', 'win32')).toBe('C:/code/app')
    expect(trustKey('/code/./app/', 'darwin')).toBe('/code/app/')
  })

  it('copies the repository trust to the worktree and keeps everything else', async () => {
    writeFileSync(
      file,
      JSON.stringify({
        userID: 'x',
        projects: { [trustKey(repo)]: { hasTrustDialogAccepted: true, other: 1 } },
      }),
    )
    expect(await inheritClaudeTrust(worktree, repo, file)).toBe('granted')
    expect(projects()[trustKey(worktree)]).toEqual({ hasTrustDialogAccepted: true })
    expect(projects()[trustKey(repo)]).toEqual({ hasTrustDialogAccepted: true, other: 1 })
    expect(JSON.parse(readFileSync(file, 'utf8')).userID).toBe('x')
    expect(await inheritClaudeTrust(worktree, repo, file)).toBe('already-trusted')
  })

  it('never trusts a worktree of an untrusted repository', async () => {
    writeFileSync(file, JSON.stringify({ projects: { [trustKey(repo)]: { hasTrustDialogAccepted: false } } }))
    expect(await inheritClaudeTrust(worktree, repo, file)).toBe('repo-not-trusted')
    expect(projects()[trustKey(worktree)]).toBeUndefined()
  })

  it('does nothing without a readable config', async () => {
    expect(await inheritClaudeTrust(worktree, repo, join(dir, 'missing.json'))).toBe('unavailable')
  })
})
