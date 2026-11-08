import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import type { AgentMeta, AgentStatus, TerminalInfo } from '@lenz/protocol'
import { SerializeAddon } from '@xterm/addon-serialize'
import { Terminal as HeadlessTerminal } from '@xterm/headless'
import * as pty from 'node-pty'
import { type HookPayload, hookToStatus } from './claude-hooks'
import { defaultShell } from './default-shell'
import { PROGRAM_STATUS_QUERY_REPLY, parseProgramStatus } from './program-status'

const SCROLLBACK_LINES = 5000
/** Hooks speak for the agent; its own OSC 7501 reports fill in once hooks go quiet this long. */
const HOOK_PRECEDENCE_MS = 120_000

export interface SessionOptions {
  cwd: string
  cols: number
  rows: number
  argv?: string[]
  env?: Record<string, string>
  unsetEnv?: string[]
  agent?: AgentMeta
}

interface Chunk {
  seq: number
  data: string
}

type DataListener = (chunk: Chunk) => void
type ExitListener = (exitCode: number | null) => void
type StatusListener = (status: AgentStatus) => void

/**
 * One PTY plus a headless mirror of its screen, so a client that attaches
 * later gets the current screen and scrollback instead of a blank terminal.
 */
export class TerminalSession {
  readonly id = `t${randomBytes(4).toString('hex')}`
  readonly createdAt = Date.now()
  private readonly pty: pty.IPty
  private readonly mirror: HeadlessTerminal
  private readonly serializer = new SerializeAddon()
  private readonly shell: string
  private readonly cwd: string
  private cols: number
  private rows: number

  /** Last seq handed out; data up to here has been sent to attached clients. */
  private seq = 0
  /** Data already emitted but not yet parsed by the mirror. */
  private readonly unparsed: Chunk[] = []
  private parsedSeq = 0
  private outbox = ''
  private flushScheduled = false
  private exited = false
  private agent: AgentMeta | undefined
  private status: AgentStatus | undefined
  private lastHookAt = 0

  private readonly dataListeners = new Set<DataListener>()
  private readonly exitListeners = new Set<ExitListener>()
  private readonly statusListeners = new Set<StatusListener>()

  constructor(options: SessionOptions) {
    const argv = options.argv?.length ? options.argv : defaultShell()
    const [file, ...args] = argv as [string, ...string[]]
    this.shell = file
    this.cwd = existsSync(options.cwd) ? options.cwd : homedir()
    this.cols = clampSize(options.cols, 80)
    this.rows = clampSize(options.rows, 24)
    this.agent = options.agent
    // An agent waits for instructions until its first hook or report says otherwise.
    if (options.agent) this.status = { state: 'idle', source: 'hook', updatedAt: this.createdAt }

    const env: Record<string, string> = {}
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) env[key] = value
    }
    // lenzd runs as Electron-in-node-mode; children must not inherit that.
    delete env.ELECTRON_RUN_AS_NODE
    delete env.LENZ_BUILD_ID
    for (const key of options.unsetEnv ?? []) delete env[key]
    Object.assign(env, options.env, {
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      TERM_PROGRAM: 'Lenz',
      LENZ_TERMINAL_ID: this.id,
    })

    this.mirror = new HeadlessTerminal({
      cols: this.cols,
      rows: this.rows,
      scrollback: SCROLLBACK_LINES,
      allowProposedApi: true,
    })
    this.mirror.loadAddon(this.serializer)
    this.mirror.parser.registerOscHandler(7501, (body) => {
      this.handleProgramStatus(body)
      return true
    })

    this.pty = pty.spawn(file, args, {
      name: 'xterm-256color',
      cwd: this.cwd,
      cols: this.cols,
      rows: this.rows,
      env,
    })
    this.pty.onData((data) => this.queue(data))
    this.pty.onExit(({ exitCode }) => this.handleExit(exitCode))
  }

  info(): TerminalInfo {
    return {
      id: this.id,
      pid: this.pty.pid,
      cwd: this.cwd,
      shell: this.shell,
      cols: this.cols,
      rows: this.rows,
      createdAt: this.createdAt,
      ...(this.agent ? { agent: this.agent } : {}),
      ...(this.status ? { status: this.status } : {}),
    }
  }

  get isExited(): boolean {
    return this.exited
  }

  /**
   * The screen as of `seq`, plus the chunks after it that the mirror has not
   * parsed yet. Clients drop any later `terminal.data` with seq <= the one
   * they already have.
   */
  snapshot(): { snapshot: string; seq: number; pending: Chunk[] } {
    this.flush()
    return {
      snapshot: this.serializer.serialize({ scrollback: SCROLLBACK_LINES }),
      seq: this.parsedSeq,
      pending: [...this.unparsed],
    }
  }

  write(data: string): void {
    if (!this.exited) this.pty.write(data)
  }

  resize(cols: number, rows: number): void {
    const nextCols = clampSize(cols, this.cols)
    const nextRows = clampSize(rows, this.rows)
    if (this.exited || (nextCols === this.cols && nextRows === this.rows)) return
    this.cols = nextCols
    this.rows = nextRows
    this.pty.resize(nextCols, nextRows)
    this.mirror.resize(nextCols, nextRows)
  }

  kill(): void {
    if (this.exited) return
    try {
      this.pty.kill()
    } catch {
      // Already gone; onExit reports it.
    }
  }

  onData(listener: DataListener): () => void {
    this.dataListeners.add(listener)
    return () => this.dataListeners.delete(listener)
  }

  onExit(listener: ExitListener): () => void {
    this.exitListeners.add(listener)
    return () => this.exitListeners.delete(listener)
  }

  onStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener)
    return () => this.statusListeners.delete(listener)
  }

  /** A Claude Code hook reported in (see HookServer). */
  applyHook(payload: HookPayload): void {
    this.lastHookAt = Date.now()
    const update = hookToStatus(payload, this.status?.state)
    if (!update) return
    if (update.sessionId && this.agent && this.agent.sessionId !== update.sessionId) {
      this.agent = { ...this.agent, sessionId: update.sessionId }
    }
    const { sessionId: _sessionId, ...status } = update
    this.setStatus({ ...status, source: 'hook' })
  }

  private handleProgramStatus(body: string): void {
    const message = parseProgramStatus(body)
    if (!message) return
    if (message.type === 'query') {
      // The mirror parses in order, so the reply follows the question; only lenzd answers.
      this.write(PROGRAM_STATUS_QUERY_REPLY)
      return
    }
    if (Date.now() - this.lastHookAt < HOOK_PRECEDENCE_MS) return
    const { state, kind, message: text } = message
    this.setStatus({
      state: state === 'clear' ? 'idle' : state,
      ...(kind ? { kind } : {}),
      ...(text ? { message: text } : {}),
      source: 'osc',
    })
  }

  private setStatus(next: Omit<AgentStatus, 'updatedAt'>): void {
    const previous = this.status
    if (
      previous &&
      previous.state === next.state &&
      previous.kind === next.kind &&
      previous.message === (next.message ?? previous.message)
    ) {
      return
    }
    // A tool-less update mid-turn keeps the last tool line.
    const message = next.message ?? (next.state === previous?.state ? previous?.message : undefined)
    const status: AgentStatus = {
      ...next,
      ...(message ? { message } : {}),
      updatedAt: Date.now(),
    }
    if (!message) delete status.message
    this.status = status
    for (const listener of this.statusListeners) listener(status)
  }

  private handleExit(exitCode: number | null): void {
    this.flush()
    this.exited = true
    for (const listener of this.exitListeners) listener(exitCode)
  }

  // Coalesce bursts of small PTY writes into one event per tick.
  private queue(data: string): void {
    this.outbox += data
    if (this.flushScheduled) return
    this.flushScheduled = true
    setImmediate(() => this.flush())
  }

  private flush(): void {
    this.flushScheduled = false
    if (this.outbox === '') return
    const chunk: Chunk = { seq: ++this.seq, data: this.outbox }
    this.outbox = ''
    this.unparsed.push(chunk)
    this.mirror.write(chunk.data, () => {
      this.parsedSeq = chunk.seq
      const index = this.unparsed.indexOf(chunk)
      if (index >= 0) this.unparsed.splice(0, index + 1)
    })
    for (const listener of this.dataListeners) listener(chunk)
  }
}

function clampSize(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.max(2, Math.min(1000, Math.floor(value)))
}
