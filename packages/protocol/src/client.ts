import { EventEmitter } from 'node:events'
import { connect, type Socket } from 'node:net'
import type { ErrorCode, EventName, Events, Frame, MethodName, Params, Result } from './messages'
import { encodeFrame, NdjsonDecoder } from './ndjson'

export class LenzRpcError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'LenzRpcError'
  }
}

interface Pending {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
}

interface ClientEvents {
  event: [name: EventName, payload: Events[EventName]]
  close: []
}

export class LenzClient extends EventEmitter<ClientEvents> {
  private nextId = 1
  private readonly pending = new Map<number, Pending>()
  private closed = false

  private constructor(private readonly socket: Socket) {
    super()
    const decoder = new NdjsonDecoder()
    socket.setEncoding('utf8')
    socket.on('data', (chunk: string) => {
      for (const frame of decoder.push(chunk) as Frame[]) this.handle(frame)
    })
    socket.on('close', () => this.onClose())
    socket.on('error', () => this.onClose())
  }

  static connect(endpoint: string, timeoutMs = 1000): Promise<LenzClient> {
    return new Promise((resolve, reject) => {
      const socket = connect(endpoint)
      const timer = setTimeout(() => {
        socket.destroy()
        reject(new Error(`lenzd did not answer at ${endpoint}`))
      }, timeoutMs)
      socket.once('connect', () => {
        clearTimeout(timer)
        socket.removeAllListeners('error')
        resolve(new LenzClient(socket))
      })
      socket.once('error', (error) => {
        clearTimeout(timer)
        reject(error)
      })
    })
  }

  get isClosed(): boolean {
    return this.closed
  }

  request<M extends MethodName>(method: M, params: Params<M>): Promise<Result<M>> {
    if (this.closed) return Promise.reject(new Error('lenzd connection is closed'))
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject })
      this.socket.write(encodeFrame({ kind: 'req', id, method, params }))
    })
  }

  close(): void {
    this.socket.end()
  }

  private handle(frame: Frame): void {
    if (frame.kind === 'evt') {
      this.emit('event', frame.event as EventName, frame.payload as Events[EventName])
      return
    }
    if (frame.kind !== 'res') return
    const pending = this.pending.get(frame.id)
    if (!pending) return
    this.pending.delete(frame.id)
    if ('error' in frame) pending.reject(new LenzRpcError(frame.error.code, frame.error.message))
    else pending.resolve(frame.result)
  }

  private onClose(): void {
    if (this.closed) return
    this.closed = true
    for (const pending of this.pending.values()) pending.reject(new Error('lenzd connection closed'))
    this.pending.clear()
    this.emit('close')
  }
}
