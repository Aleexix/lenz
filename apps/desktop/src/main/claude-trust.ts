/**
 * Claude Code asks "do you trust this folder?" the first time it runs in a
 * folder, and remembers the answer in its global config
 * (`projects[<folder>].hasTrustDialogAccepted`). A task worktree is a new
 * folder, so every task would stop at that question. Lenz copies the answer
 * the person already gave for the repository to its worktree, and nothing
 * else: an untrusted repository still gets asked.
 */
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, posix, win32 } from 'node:path'
import { lock } from 'proper-lockfile'

export type TrustOutcome = 'granted' | 'already-trusted' | 'repo-not-trusted' | 'unavailable'

type Config = Record<string, unknown> & { projects?: Record<string, { hasTrustDialogAccepted?: boolean }> }

/** Where Claude keeps its global config: legacy `.config.json`, else `.claude.json`. */
export function claudeConfigFile(env: NodeJS.ProcessEnv = process.env, home = homedir()): string {
  const legacy = join(env.CLAUDE_CONFIG_DIR ?? join(home, '.claude'), '.config.json')
  if (existsSync(legacy)) return legacy
  const suffix = env.CLAUDE_CODE_CUSTOM_OAUTH_URL ? '-custom-oauth' : ''
  return join(env.CLAUDE_CONFIG_DIR || home, `.claude${suffix}.json`)
}

/** Claude's key for a folder: normalized, NFC, and with `/` separators on Windows. */
export function trustKey(folder: string, platform: NodeJS.Platform = process.platform): string {
  if (platform !== 'win32') return posix.normalize(folder.normalize('NFC'))
  return win32.normalize(folder.normalize('NFC')).replaceAll('\\', '/')
}

/** Windows drive letters show up in either case in Claude's config. */
function keyVariants(folder: string): string[] {
  const key = trustKey(folder)
  if (process.platform !== 'win32' || !/^[a-zA-Z]:/.test(key)) return [key]
  return [`${key[0]?.toUpperCase()}${key.slice(1)}`, `${key[0]?.toLowerCase()}${key.slice(1)}`]
}

function readConfig(file: string): Config | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Config) : null
  } catch {
    return null
  }
}

function isTrusted(config: Config, folder: string): boolean {
  return keyVariants(folder).some((key) => config.projects?.[key]?.hasTrustDialogAccepted === true)
}

function writeAtomically(file: string, config: Config): void {
  const temp = `${file}.lenz-${randomUUID()}.tmp`
  try {
    writeFileSync(temp, `${JSON.stringify(config, null, 2)}\n`)
    // Claude may have the file open for a moment on Windows.
    for (let attempt = 0; ; attempt++) {
      try {
        renameSync(temp, file)
        return
      } catch (error) {
        if (attempt >= 4) throw error
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50 * (attempt + 1))
      }
    }
  } finally {
    rmSync(temp, { force: true })
  }
}

/** Marks `worktree` trusted in Claude's config when `repo` already is. */
export async function inheritClaudeTrust(
  worktree: string,
  repo: string,
  file = claudeConfigFile(),
): Promise<TrustOutcome> {
  const before = readConfig(file)
  if (!before) return 'unavailable'
  if (!isTrusted(before, repo)) return 'repo-not-trusted'
  if (isTrusted(before, worktree)) return 'already-trusted'

  let release: () => Promise<void>
  try {
    // Same lock file Claude Code uses for its own config writes.
    release = await lock(file, {
      lockfilePath: `${file}.lock`,
      realpath: false,
      stale: 10_000,
      retries: { retries: 5, factor: 2, minTimeout: 50, maxTimeout: 400 },
    })
  } catch {
    return 'unavailable'
  }
  try {
    // Re-read under the lock: Claude may have written in between.
    const config = readConfig(file)
    if (!config) return 'unavailable'
    if (isTrusted(config, worktree)) return 'already-trusted'
    const key = trustKey(worktree)
    const projects = { ...(config.projects ?? {}) }
    projects[key] = { ...(projects[key] ?? {}), hasTrustDialogAccepted: true }
    writeAtomically(file, { ...config, projects })
    return 'granted'
  } finally {
    await release().catch(() => undefined)
  }
}
