export interface TerminalInfo {
  id: string
  pid: number
  cwd: string
  shell: string
  cols: number
  rows: number
  createdAt: number
}

export interface DaemonHello {
  buildId: string
  pid: number
  startedAt: number
  terminals: number
}

type Empty = Record<string, never>

/** Request methods: params sent by the client, result returned by lenzd. */
export interface Methods {
  'daemon.hello': { params: { client: string }; result: DaemonHello }
  'daemon.shutdown': { params: Empty; result: { ok: true } }
  'terminal.create': {
    params: { cwd: string; cols: number; rows: number; argv?: string[]; env?: Record<string, string> }
    result: TerminalInfo
  }
  'terminal.list': { params: Empty; result: TerminalInfo[] }
  /** Start receiving `terminal.data`; `snapshot` redraws the screen up to `seq`. */
  'terminal.attach': { params: { id: string }; result: { info: TerminalInfo; snapshot: string; seq: number } }
  'terminal.detach': { params: { id: string }; result: { ok: true } }
  'terminal.write': { params: { id: string; data: string }; result: { ok: true } }
  'terminal.resize': { params: { id: string; cols: number; rows: number }; result: { ok: true } }
  'terminal.kill': { params: { id: string }; result: { ok: true } }
}

/** Events pushed by lenzd. `terminal.data` only reaches clients attached to that terminal. */
export interface Events {
  'terminal.data': { id: string; seq: number; data: string }
  'terminal.exit': { id: string; exitCode: number | null }
}

export type MethodName = keyof Methods
export type EventName = keyof Events
export type Params<M extends MethodName> = Methods[M]['params']
export type Result<M extends MethodName> = Methods[M]['result']

export type ErrorCode = 'not_found' | 'bad_request' | 'spawn_failed' | 'internal'

export interface RequestFrame {
  kind: 'req'
  id: number
  method: string
  params: unknown
}

export type ResponseFrame =
  | { kind: 'res'; id: number; result: unknown }
  | { kind: 'res'; id: number; error: { code: ErrorCode; message: string } }

export interface EventFrame {
  kind: 'evt'
  event: string
  payload: unknown
}

export type Frame = RequestFrame | ResponseFrame | EventFrame
