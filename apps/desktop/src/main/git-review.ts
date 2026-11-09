import { execFile, spawn } from 'node:child_process'
import { closeSync, existsSync, openSync, readFileSync, readSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type {
  ChangedFile,
  ChangeSet,
  FileChangeStatus,
  FileVersions,
  PullRequestRequest,
  PullRequestResult,
} from '../shared/review'
import { findClaude, PARENT_SESSION_ENV } from './agent-launcher'
import { GitError, git, lines } from './git-worktrees'

const MAX_DIFF_BYTES = 1_500_000
const MAX_PROMPT_DIFF_CHARS = 60_000

const STATUS: Record<string, FileChangeStatus> = {
  A: 'added',
  M: 'modified',
  D: 'deleted',
  R: 'renamed',
  T: 'modified',
}

/** Files changed since the task left its base branch (or since HEAD), committed or not, plus untracked files. */
export async function changeSet(path: string, baseBranch?: string): Promise<ChangeSet> {
  const baseRef = baseBranch
    ? (lines(await git(path, ['merge-base', baseBranch, 'HEAD']))[0] ?? 'HEAD')
    : 'HEAD'
  const files = new Map<string, ChangedFile>()

  // -z: paths come raw, without quoting, NUL-separated.
  const nameStatus = (await git(path, ['diff', '--name-status', '-M', '-z', baseRef])).split('\0')
  for (let i = 0; i < nameStatus.length; ) {
    const code = nameStatus[i++]
    if (!code) continue
    const kind = STATUS[code[0] ?? ''] ?? 'modified'
    if (kind === 'renamed') {
      const oldPath = nameStatus[i++] ?? ''
      const newPath = nameStatus[i++] ?? ''
      files.set(newPath, { path: newPath, oldPath, status: kind, additions: 0, deletions: 0, binary: false })
    } else {
      const file = nameStatus[i++] ?? ''
      files.set(file, { path: file, status: kind, additions: 0, deletions: 0, binary: false })
    }
  }

  const numstat = (await git(path, ['diff', '--numstat', '-M', '-z', baseRef])).split('\0')
  for (let i = 0; i < numstat.length; ) {
    const entry = numstat[i++]
    if (!entry) continue
    const [added, deleted, file] = entry.split('\t')
    // Renames leave the path field empty and put old and new paths in the next two entries.
    let target = file
    if (!target) {
      target = numstat[i + 1]
      i += 2
    }
    const change = target ? files.get(target) : undefined
    if (!change) continue
    change.binary = added === '-'
    change.additions = Number.parseInt(added ?? '0', 10) || 0
    change.deletions = Number.parseInt(deleted ?? '0', 10) || 0
  }

  for (const file of lines(await git(path, ['ls-files', '--others', '--exclude-standard', '-z'])).flatMap(
    (l) => l.split('\0'),
  )) {
    if (!file || files.has(file)) continue
    const full = join(path, file)
    const binary = looksBinary(full)
    files.set(file, {
      path: file,
      status: 'added',
      additions: binary ? 0 : countLines(full),
      deletions: 0,
      binary,
    })
  }

  return {
    baseRef,
    baseLabel: baseBranch ?? 'último commit',
    files: [...files.values()].sort((a, b) => a.path.localeCompare(b.path)),
  }
}

function looksBinary(file: string): boolean {
  try {
    const fd = openSync(file, 'r')
    const buffer = Buffer.alloc(8000)
    const read = readSync(fd, buffer, 0, buffer.length, 0)
    closeSync(fd)
    return buffer.subarray(0, read).includes(0)
  } catch {
    return false
  }
}

function countLines(file: string): number {
  try {
    if (statSync(file).size > MAX_DIFF_BYTES) return 0
    const text = readFileSync(file, 'utf8')
    return text === '' ? 0 : text.split('\n').length - (text.endsWith('\n') ? 1 : 0)
  } catch {
    return 0
  }
}

/** Before and after text of one file, for the diff view. */
export async function fileVersions(path: string, baseRef: string, file: ChangedFile): Promise<FileVersions> {
  if (file.binary) return { original: '', modified: '', skipped: 'binary' }
  const full = join(path, file.path)
  if (file.status !== 'deleted' && existsSync(full) && statSync(full).size > MAX_DIFF_BYTES) {
    return { original: '', modified: '', skipped: 'too-large' }
  }
  const original =
    file.status === 'added'
      ? ''
      : await git(path, ['show', `${baseRef}:${file.oldPath ?? file.path}`]).catch(() => '')
  if (original.length > MAX_DIFF_BYTES) return { original: '', modified: '', skipped: 'too-large' }
  const modified = file.status === 'deleted' || !existsSync(full) ? '' : readFileSync(full, 'utf8')
  return { original, modified }
}

/** Stages everything in the worktree and commits it. Returns the short hash. */
export async function commitAll(path: string, message: string): Promise<string> {
  if (!message.trim()) throw new GitError('El commit necesita un mensaje')
  await git(path, ['add', '-A'])
  await git(path, ['commit', '-m', message.trim()])
  return lines(await git(path, ['rev-parse', '--short', 'HEAD']))[0] ?? ''
}

function run(
  command: string,
  args: string[],
  cwd: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(
      command,
      args,
      { cwd, windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
      (error, stdout, stderr) => {
        const code = error
          ? (error as NodeJS.ErrnoException).code === 'ENOENT'
            ? -1
            : (error.code as number) || 1
          : 0
        resolve({ code, stdout, stderr })
      },
    )
  })
}

/** Pushes the task branch and opens a pull request with GitHub CLI. */
export async function createPullRequest(request: PullRequestRequest): Promise<PullRequestResult> {
  const version = await run('gh', ['--version'], request.path)
  if (version.code === -1) {
    return {
      kind: 'needs-gh',
      reason:
        'GitHub CLI (gh) no está instalado. Instálalo desde https://cli.github.com y ejecuta "gh auth login".',
    }
  }
  const auth = await run('gh', ['auth', 'status'], request.path)
  if (auth.code !== 0)
    return {
      kind: 'needs-gh',
      reason: 'gh no tiene una sesión activa. Ejecuta "gh auth login" en una terminal.',
    }
  const remotes = lines(await git(request.path, ['remote']))
  if (!remotes.includes('origin')) throw new GitError('El repositorio no tiene un remoto "origin"')

  await git(request.path, ['push', '-u', 'origin', request.branch])
  const created = await run(
    'gh',
    [
      'pr',
      'create',
      '--base',
      request.baseBranch,
      '--head',
      request.branch,
      '--title',
      request.title,
      '--body',
      request.body,
    ],
    request.path,
  )
  if (created.code !== 0) throw new GitError(created.stderr.trim() || 'gh no pudo crear el PR')
  const url =
    lines(created.stdout).find((line) => line.startsWith('http')) ?? lines(created.stdout).at(-1) ?? ''
  return { kind: 'created', url }
}

/**
 * Asks Claude Code (print mode, small model) to write a commit message or a
 * PR title and body from the diff. Uses the person's own `claude` login.
 */
export async function draftMessage(path: string, baseRef: string, kind: 'commit' | 'pr'): Promise<string> {
  const claude = await findClaude()
  if (!claude) throw new Error('No se encontró Claude Code (`claude`) para redactar el mensaje')

  const stat = await git(path, ['diff', '--stat', baseRef])
  let diff = await git(path, ['diff', baseRef])
  const untracked = lines(await git(path, ['ls-files', '--others', '--exclude-standard']))
  if (diff.length > MAX_PROMPT_DIFF_CHARS)
    diff = `${diff.slice(0, MAX_PROMPT_DIFF_CHARS)}\n[… diff recortado …]`
  const context = [
    'Resumen de cambios:',
    stat,
    untracked.length ? `Archivos nuevos sin seguimiento:\n${untracked.join('\n')}` : '',
    'Diff:',
    diff,
  ].join('\n\n')

  const instruction =
    kind === 'commit'
      ? 'A partir del diff recibido por stdin, escribe un mensaje de commit en español al estilo Conventional Commits: una primera línea de máximo 72 caracteres y, si aporta, un cuerpo breve con viñetas. Responde SOLO con el mensaje, sin comillas ni bloques de código.'
      : 'A partir del diff recibido por stdin, escribe un pull request en español. Primera línea: el título (máximo 72 caracteres). Luego una línea en blanco y una descripción en Markdown con un resumen y una lista de cambios. Responde SOLO con eso, sin bloques de código.'

  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) if (value !== undefined) env[key] = value
  for (const key of PARENT_SESSION_ENV) delete env[key]
  delete env.ELECTRON_RUN_AS_NODE

  const [command, ...prefix] = claude.prefix as [string, ...string[]]
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...prefix, '-p', '--model', 'haiku', instruction], {
      cwd: path,
      env,
      windowsHide: true,
    })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error('Claude tardó demasiado en redactar el mensaje'))
    }, 120_000)
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8')
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
    })
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      const text = stdout
        .trim()
        .replace(/^```[a-z]*\n?|\n?```$/g, '')
        .trim()
      if (code === 0 && text) resolve(text)
      else reject(new Error(stderr.trim() || `claude terminó con código ${code}`))
    })
    child.stdin.end(context)
  })
}
