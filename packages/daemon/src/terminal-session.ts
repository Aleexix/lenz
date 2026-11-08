import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import type { TerminalInfo } from '@lenz/protocol'
import { SerializeAddon } from '@xterm/addon-serialize'
import { Terminal as HeadlessTerminal } from '@xterm/headless'
import * as pty from 'node-pty'
import { defaultShell } from './default-shell'

const SCROLLBACK_LINES = 5000

export interface SessionOptions {
  cwd: string
  cols: number
  rows: number
  argv?: string[]
  env?: Record<string, string>
}

interface Chunk {
  seq: number
  data: string
}

type DataListener = (chunk: Chunk) => void
type ExitListener = (exitCode: number | null) => void

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

  private readonly dataListeners = new Set<DataListener>()
  private readonly exitListeners = new Set<ExitListener>()

  constructor(options: SessionOptions) {
    const argv = options.argv?.length ? options.argv : defaultShell()
    const [file, ...args] = argv as [string, ...string[]]
    this.shell = file
    this.cwd = existsSync(options.cwd) ? options.cwd : homedir()
    this.cols = clampSize(options.cols, 80)
    this.rows = clampSize(options.rows, 24)

    const env: Record<string, string> = {}
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) env[key] = value
    }
    // lenzd runs as Electron-in-node-mode; children must not inherit that.
    delete env.ELECTRON_RUN_AS_NODE
    delete env.LENZ_BUILD_ID
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
