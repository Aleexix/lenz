import { execFile } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import { promisify } from 'node:util'
import { CLAUDE_HOOK_EVENTS, type CreateTerminalParams, hookUrl } from '@lenz/protocol'
import type { LaunchAgentRequest, ProviderProfile } from '../shared/profiles'

const execFileAsync = promisify(execFile)

/**
 * Markers a running Claude Code session puts in its children's environment.
 * Inherited by an agent (Lenz opened from a Claude terminal), they make it
 * think it is a sub-session: no transcript, so no resume.
 */
const PARENT_SESSION_ENV = [
  'CLAUDECODE',
  'CLAUDE_CODE_CHILD_SESSION',
  'CLAUDE_CODE_SESSION_ID',
  'CLAUDE_CODE_ENTRYPOINT',
  'CLAUDE_CODE_SESSION_ATTENDED',
  'CLAUDE_CODE_MESSAGING_SOCKET',
  'CLAUDE_CODE_MESSAGING_TOKEN',
  'CLAUDE_CODE_EXECPATH',
  'CLAUDE_CODE_PLUGIN_DIRS',
  'CLAUDE_CODE_HOST_SHORT_TEMP_DIRS',
  'CLAUDE_CODE_ALT_SCREEN_FULL_REPAINT',
  'CLAUDE_PID',
  'CLAUDE_EFFORT',
  'CLAUDE_JOB_DIR',
]

/** How to start `claude` on this machine: the executable plus any wrapper arguments. */
interface ClaudeCommand {
  prefix: string[]
}

/**
 * Finds Claude Code. Windows: claude.exe (native installer) or claude.cmd
 * (npm) on PATH. macOS/Linux: whatever the login shell finds, since apps
 * opened from the Dock don't get the shell's PATH.
 */
async function findClaude(): Promise<ClaudeCommand | null> {
  if (process.platform === 'win32') {
    const dirs = (process.env.PATH ?? '').split(delimiter).filter(Boolean)
    const home = process.env.USERPROFILE
    if (home) dirs.push(join(home, '.local', 'bin'))
    for (const dir of dirs) {
      const exe = join(dir, 'claude.exe')
      if (existsSync(exe)) return { prefix: [exe] }
    }
    for (const dir of dirs) {
      const cmd = join(dir, 'claude.cmd')
      if (existsSync(cmd)) return { prefix: [process.env.ComSpec || 'cmd.exe', '/d', '/c', cmd] }
    }
    return null
  }
  const shell = process.env.SHELL || '/bin/zsh'
  try {
    const { stdout } = await execFileAsync(shell, ['-l', '-c', 'command -v claude'], { timeout: 10_000 })
    if (!stdout.trim()) return null
  } catch {
    return null
  }
  // `exec "$0" "$@"` runs claude with the arguments untouched by shell quoting.
  return { prefix: [shell, '-l', '-c', 'exec claude "$@"', 'claude'] }
}

export class AgentLauncher {
  private claude: Promise<ClaudeCommand | null> | null = null
  /** terminal id → settings file to delete when the agent exits */
  private readonly settingsFiles = new Map<string, string>()

  constructor(private readonly home: string) {}

  /**
   * The terminal.create params for an agent: Claude Code with Lenz's hooks
   * (through --settings, so the person's own settings stay untouched) and the
   * profile's environment.
   */
  async prepare(
    request: LaunchAgentRequest,
    profile: ProviderProfile,
    apiKey: string | undefined,
    hookPort: number,
  ): Promise<{ params: CreateTerminalParams; settingsFile: string }> {
    this.claude ??= findClaude()
    const claude = await this.claude
    if (!claude) {
      this.claude = null
      throw new Error('No se encontró Claude Code (`claude`). Instálalo desde https://claude.com/claude-code')
    }

    const statusToken = `tok_${randomBytes(18).toString('hex')}`
    const settingsDir = join(this.home, 'agents')
    mkdirSync(settingsDir, { recursive: true })
    const settingsFile = join(settingsDir, `${statusToken}.json`)
    const hook = { type: 'http', url: hookUrl(hookPort, statusToken), timeout: 5 }
    const hooks = Object.fromEntries(CLAUDE_HOOK_EVENTS.map((event) => [event, [{ hooks: [hook] }]]))
    writeFileSync(settingsFile, JSON.stringify({ hooks }, null, 2))

    const sessionId = request.resumeSessionId ?? randomUUID()
    const args = [
      '--settings',
      settingsFile,
      ...(request.resumeSessionId ? ['--resume', sessionId] : ['--session-id', sessionId]),
      ...(request.prompt?.trim() ? [request.prompt.trim()] : []),
    ]

    return {
      settingsFile,
      params: {
        cwd: request.cwd,
        cols: request.cols,
        rows: request.rows,
        argv: [...claude.prefix, ...args],
        env: profileEnvironment(profile, apiKey),
        unsetEnv: PARENT_SESSION_ENV,
        agent: { name: request.name, profileId: profile.id, sessionId },
        statusToken,
      },
    }
  }

  track(terminalId: string, settingsFile: string): void {
    this.settingsFiles.set(terminalId, settingsFile)
  }

  /** The terminal never started; drop its settings file. */
  discard(settingsFile: string): void {
    rmSync(settingsFile, { force: true })
  }

  /** The agent's terminal ended; its hook settings are no longer needed. */
  forget(terminalId: string): void {
    const file = this.settingsFiles.get(terminalId)
    if (!file) return
    this.settingsFiles.delete(terminalId)
    rmSync(file, { force: true })
  }
}

function profileEnvironment(profile: ProviderProfile, apiKey: string | undefined): Record<string, string> {
  if (profile.kind === 'claude-subscription') return {}
  if (!apiKey) throw new Error(`El perfil "${profile.name}" no tiene API key`)
  const env: Record<string, string> = {
    ANTHROPIC_BASE_URL: profile.baseUrl ?? '',
    ANTHROPIC_AUTH_TOKEN: apiKey,
    // A key from the person's own environment must not override the profile's.
    ANTHROPIC_API_KEY: '',
    API_TIMEOUT_MS: '3000000',
  }
  if (profile.model) {
    env.ANTHROPIC_DEFAULT_OPUS_MODEL = profile.model
    env.ANTHROPIC_DEFAULT_SONNET_MODEL = profile.model
  }
  const fast = profile.fastModel ?? profile.model
  if (fast) env.ANTHROPIC_DEFAULT_HAIKU_MODEL = fast
  return env
}
