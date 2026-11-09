import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { changeSet, commitAll, fileVersions } from './git-review'

const repo = join(realpathSync(mkdtempSync(join(tmpdir(), 'lenz-review-'))), 'repo')
afterAll(() => rmSync(join(repo, '..'), { recursive: true, force: true }))

function git(...args: string[]): string {
  return execFileSync('git', ['-c', 'user.name=Lenz Test', '-c', 'user.email=test@lenz.dev', ...args], {
    cwd: repo,
    encoding: 'utf8',
  })
}

mkdirSync(repo)
git('init', '-q', '-b', 'main')
git('config', 'user.name', 'Lenz Test')
git('config', 'user.email', 'test@lenz.dev')
git('config', 'core.autocrlf', 'false')
writeFileSync(join(repo, 'app.ts'), 'const a = 1\nconst b = 2\n')
writeFileSync(join(repo, 'old name.txt'), 'uno\ndos\ntres\ncuatro\n')
writeFileSync(join(repo, 'gone.txt'), 'bye\n')
git('add', '.')
git('commit', '-q', '-m', 'base')
git('checkout', '-q', '-b', 'lenz/task')

describe('review changes', () => {
  it('lists committed and uncommitted changes since the base branch', async () => {
    // Committed on the task branch: a rename.
    git('mv', 'old name.txt', 'new name.txt')
    git('commit', '-q', '-m', 'rename')
    // Uncommitted: an edit, a deletion, a new text file and a new binary file.
    writeFileSync(join(repo, 'app.ts'), 'const a = 1\nconst b = 3\nconst c = 4\n')
    unlinkSync(join(repo, 'gone.txt'))
    writeFileSync(join(repo, 'nuevo.md'), '# hola\nlínea\n')
    writeFileSync(join(repo, 'logo.bin'), Buffer.from([0, 1, 2, 0, 255]))

    const set = await changeSet(repo, 'main')
    expect(set.baseLabel).toBe('main')
    const byPath = Object.fromEntries(set.files.map((file) => [file.path, file]))
    expect(byPath['app.ts']).toMatchObject({ status: 'modified', additions: 2, deletions: 1 })
    expect(byPath['gone.txt']).toMatchObject({ status: 'deleted', deletions: 1 })
    expect(byPath['new name.txt']).toMatchObject({ status: 'renamed', oldPath: 'old name.txt' })
    expect(byPath['nuevo.md']).toMatchObject({ status: 'added', additions: 2, binary: false })
    expect(byPath['logo.bin']).toMatchObject({ status: 'added', binary: true })

    const appVersions = await fileVersions(repo, set.baseRef, byPath['app.ts'] as never)
    expect(appVersions).toEqual({
      original: 'const a = 1\nconst b = 2\n',
      modified: 'const a = 1\nconst b = 3\nconst c = 4\n',
    })
    expect((await fileVersions(repo, set.baseRef, byPath['new name.txt'] as never)).original).toBe(
      'uno\ndos\ntres\ncuatro\n',
    )
    expect(await fileVersions(repo, set.baseRef, byPath['gone.txt'] as never)).toEqual({
      original: 'bye\n',
      modified: '',
    })
    expect((await fileVersions(repo, set.baseRef, byPath['logo.bin'] as never)).skipped).toBe('binary')
  })

  it('commits everything in the worktree', async () => {
    const hash = await commitAll(repo, 'feat: cambios de prueba')
    expect(hash).toMatch(/^[0-9a-f]{7,}$/)
    expect(git('status', '--porcelain')).toBe('')
    expect(git('log', '-1', '--format=%s')).toBe('feat: cambios de prueba\n')
    // Measured from HEAD, a clean worktree has nothing to review.
    expect((await changeSet(repo)).files).toEqual([])
    await expect(commitAll(repo, '   ')).rejects.toThrow('mensaje')
  })
})
