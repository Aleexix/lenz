/**
 * What an agent is doing. `done` means it finished a turn and is waiting;
 * the app turns it into idle once the person has looked at it.
 */
export type AgentState = 'idle' | 'working' | 'blocked' | 'done' | 'error'

/** Why a blocked agent is waiting: approve a tool, answer a question, or sign in. */
export type BlockKind = 'permission' | 'question' | 'auth'

export interface AgentStatus {
  state: AgentState
  kind?: BlockKind
  /** One line for the squad list: the tool in use, what needs approval, the last reply. */
  message?: string
  /** `hook`: Claude Code hooks. `osc`: the program's own OSC 7501 reports. */
  source: 'hook' | 'osc'
  updatedAt: number
}

/** Set on terminals that run an agent rather than a plain shell. */
export interface AgentMeta {
  name: string
  profileId: string
  /** Claude Code session id, used to resume after the terminal is gone. */
  sessionId?: string
}

export interface TerminalInfo {
  id: string
  pid: number
  cwd: string
  shell: string
  cols: number
  rows: number
  createdAt: number
  agent?: AgentMeta
  status?: AgentStatus
}

export interface DaemonHello {
  buildId: string
  pid: number
  startedAt: number
  terminals: number
  /** Port of lenzd's loopback HTTP server for agent hooks. */
  hookPort: number
}

type Empty = Record<string, never>

export interface CreateTerminalParams {
  cwd: string
  cols: number
  rows: number
  argv?: string[]
  env?: Record<string, string>
  /** Variables to remove from the inherited environment before `env` is applied. */
  unsetEnv?: string[]
  agent?: AgentMeta
  /** Hooks POST to http://127.0.0.1:<hookPort>/hooks/<statusToken> to report this terminal's status. */
  statusToken?: string
}

/** Request methods: params sent by the client, result returned by lenzd. */
export interface Methods {
  'daemon.hello': { params: { client: string }; result: DaemonHello }
  'daemon.shutdown': { params: Empty; result: { ok: true } }
  'terminal.create': { params: CreateTerminalParams; result: TerminalInfo }
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
  /** Sent to every client, attached or not, so the squad list stays current. */
  'agent.status': { id: string; status: AgentStatus }
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
