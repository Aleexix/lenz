import { unlinkSync } from 'node:fs'
import { connect, createServer, type Server, type Socket } from 'node:net'
import {
  type ErrorCode,
  type EventName,
  type Events,
  encodeFrame,
  type MethodName,
  NdjsonDecoder,
  type Params,
  type RequestFrame,
  type Result,
} from '@lenz/protocol'
import { TerminalSession } from './terminal-session'

const IDLE_EXIT_MS = 60_000

export interface DaemonOptions {
  endpoint: string
  buildId: string
  log: (message: string) => void
  /** Called when there have been no terminals and no clients for a while. */
  onIdle?: () => void
  /** Called after `daemon.shutdown` has been answered and everything is closed. */
  onShutdown?: () => void
  idleExitMs?: number
}

class RpcError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message)
  }
}

class ClientConnection {
  /** terminal id → unsubscribe from its data */
  readonly attached = new Map<string, () => void>()
  /** Work that must run right after the current reply is written. */
  afterReply: (() => void) | undefined

  constructor(readonly socket: Socket) {}

  takeAfterReply(): (() => void) | undefined {
    const work = this.afterReply
    this.afterReply = undefined
    return work
  }

  send(frame: unknown): void {
    if (!this.socket.destroyed) this.socket.write(encodeFrame(frame))
  }

  emit<E extends EventName>(event: E, payload: Events[E]): void {
    this.send({ kind: 'evt', event, payload })
  }

  detach(id: string): void {
    this.attached.get(id)?.()
    this.attached.delete(id)
  }

  detachAll(): void {
    for (const unsubscribe of this.attached.values()) unsubscribe()
    this.attached.clear()
  }
}

type Handler<M extends MethodName> = (client: ClientConnection, params: Params<M>) => Result<M>

export class LenzDaemon {
  private readonly sessions = new Map<string, TerminalSession>()
  private readonly clients = new Set<ClientConnection>()
  private readonly server: Server
  private readonly startedAt = Date.now()
  private idleSince = Date.now()
  private idleTimer: NodeJS.Timeout | undefined

  constructor(private readonly options: DaemonOptions) {
    this.server = createServer((socket) => this.accept(socket))
  }

  async listen(): Promise<void> {
    try {
      await this.tryListen()
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE' || process.platform === 'win32') throw error
      // A Unix socket file survives a crash; reuse it only if nobody answers.
      if (await isAlive(this.options.endpoint)) throw new Error('lenzd is already running')
      unlinkSync(this.options.endpoint)
      await this.tryListen()
    }
    this.options.log(`listening on ${this.options.endpoint} (build ${this.options.buildId})`)
    this.idleTimer = setInterval(() => this.checkIdle(), 5_000)
    this.idleTimer.unref()
  }

  close(): void {
    clearInterval(this.idleTimer)
    for (const session of this.sessions.values()) session.kill()
    for (const client of this.clients) client.socket.destroy()
    this.server.close()
  }

  private tryListen(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.once('error', reject)
      this.server.listen(this.options.endpoint, () => {
        this.server.off('error', reject)
        resolve()
      })
    })
  }

  private accept(socket: Socket): void {
    const client = new ClientConnection(socket)
    const decoder = new NdjsonDecoder()
    this.clients.add(client)
    socket.setEncoding('utf8')
    socket.on('data', (chunk: string) => {
      let frames: unknown[]
      try {
        frames = decoder.push(chunk)
      } catch {
        this.options.log('dropping client that sent invalid JSON')
        socket.destroy()
        return
      }
      for (const frame of frames) this.dispatch(client, frame as RequestFrame)
    })
    const drop = () => {
      client.detachAll()
      if (this.clients.delete(client)) this.idleSince = Date.now()
    }
    socket.on('close', drop)
    socket.on('error', drop)
  }

  private dispatch(client: ClientConnection, frame: RequestFrame): void {
    if (frame?.kind !== 'req' || typeof frame.id !== 'number') return
    const handler = this.handlers[frame.method as MethodName] as Handler<MethodName> | undefined
    client.afterReply = undefined
    try {
      if (!handler) throw new RpcError('bad_request', `unknown method ${frame.method}`)
      const result = handler(client, (frame.params ?? {}) as never)
      client.send({ kind: 'res', id: frame.id, result })
      client.takeAfterReply()?.()
    } catch (error) {
      const code = error instanceof RpcError ? error.code : 'internal'
      const message = error instanceof Error ? error.message : String(error)
      if (code === 'internal') this.options.log(`${frame.method} failed: ${message}`)
      client.send({ kind: 'res', id: frame.id, error: { code, message } })
    }
    client.afterReply = undefined
  }

  private session(id: unknown): TerminalSession {
    const session = typeof id === 'string' ? this.sessions.get(id) : undefined
    if (!session) throw new RpcError('not_found', `no terminal ${String(id)}`)
    return session
  }

  private readonly handlers: { [M in MethodName]: Handler<M> } = {
    'daemon.hello': () => ({
      buildId: this.options.buildId,
      pid: process.pid,
      startedAt: this.startedAt,
      terminals: this.sessions.size,
    }),

    'daemon.shutdown': () => {
      setImmediate(() => {
        this.options.log('shutdown requested')
        this.close()
        this.options.onShutdown?.()
      })
      return { ok: true }
    },

    'terminal.create': (_client, params) => {
      if (typeof params.cwd !== 'string') throw new RpcError('bad_request', 'cwd is required')
      let session: TerminalSession
      try {
        session = new TerminalSession(params)
      } catch (error) {
        throw new RpcError('spawn_failed', error instanceof Error ? error.message : String(error))
      }
      this.sessions.set(session.id, session)
      session.onExit((exitCode) => {
        this.sessions.delete(session.id)
        this.idleSince = Date.now()
        for (const client of this.clients) {
          client.detach(session.id)
          client.emit('terminal.exit', { id: session.id, exitCode })
        }
        this.options.log(`terminal ${session.id} exited (${exitCode})`)
      })
      const info = session.info()
      this.options.log(`terminal ${info.id} started: ${info.shell} in ${info.cwd}`)
      return info
    },

    'terminal.list': () => [...this.sessions.values()].map((session) => session.info()),

    'terminal.attach': (client, params) => {
      const session = this.session(params.id)
      client.detach(session.id)
      const { snapshot, seq, pending } = session.snapshot()
      // Chunks the mirror hasn't parsed yet go out right after the reply.
      client.afterReply = () => {
        for (const chunk of pending) client.emit('terminal.data', { id: session.id, ...chunk })
      }
      client.attached.set(
        session.id,
        session.onData((chunk) => client.emit('terminal.data', { id: session.id, ...chunk })),
      )
      return { info: session.info(), snapshot, seq }
    },

    'terminal.detach': (client, params) => {
      client.detach(params.id)
      return { ok: true }
    },

    'terminal.write': (_client, params) => {
      if (typeof params.data !== 'string') throw new RpcError('bad_request', 'data must be a string')
      this.session(params.id).write(params.data)
      return { ok: true }
    },

    'terminal.resize': (_client, params) => {
      this.session(params.id).resize(params.cols, params.rows)
      return { ok: true }
    },

    'terminal.kill': (_client, params) => {
      this.session(params.id).kill()
      return { ok: true }
    },
  }

  private checkIdle(): void {
    if (this.sessions.size > 0 || this.clients.size > 0) {
      this.idleSince = Date.now()
      return
    }
    if (Date.now() - this.idleSince >= (this.options.idleExitMs ?? IDLE_EXIT_MS)) {
      this.options.log('idle: no terminals and no clients')
      this.options.onIdle?.()
    }
  }
}

function isAlive(endpoint: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect(endpoint)
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('error', () => resolve(false))
  })
}
