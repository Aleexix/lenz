/**
 * OSC 7501, the Program Status Protocol: a program writes
 * `ESC ] 7501 ; state=working:kind=permission:msg=<base64> ST` to say what it
 * is doing, and `ESC ] 7501 ; ? ST` to ask whether the terminal listens.
 * Spec: https://www.superlogical.com/rex/docs/build/program-status
 */
import type { AgentState, BlockKind } from '@lenz/protocol'

const STATES: readonly AgentState[] = ['idle', 'working', 'blocked', 'done', 'error']
const KINDS: readonly BlockKind[] = ['permission', 'question', 'auth']

/** Our answer to the `?` probe: the states and kinds we understand. */
export const PROGRAM_STATUS_QUERY_REPLY = `\x1b]7501;?:states=${STATES.join(',')}:kinds=${KINDS.join(',')}\x1b\\`

const MAX_BODY = 4087
const MAX_MESSAGE = 200

export type ProgramStatusMessage =
  | { type: 'query' }
  | { type: 'report'; state: AgentState | 'clear'; kind?: BlockKind; message?: string }

/** Parses the text between `OSC 7501;` and the terminator. Null means ignore it. */
export function parseProgramStatus(body: string): ProgramStatusMessage | null {
  if (body.length > MAX_BODY) return null
  if (body.trim() === '?') return { type: 'query' }

  const fields = new Map<string, string>()
  for (const pair of body.split(':')) {
    const equals = pair.indexOf('=')
    if (equals > 0) fields.set(pair.slice(0, equals).trim(), pair.slice(equals + 1).trim())
  }
  // Records for sub-ids (a program's children) are not shown yet; only the program itself.
  if (fields.has('id')) return null

  const state = fields.get('state')
  if (state !== 'clear' && !STATES.includes(state as AgentState)) return null
  const kind = fields.get('kind')
  const message = decodeText(fields.get('msg') ?? fields.get('title'))
  return {
    type: 'report',
    state: state as AgentState | 'clear',
    ...(KINDS.includes(kind as BlockKind) ? { kind: kind as BlockKind } : {}),
    ...(message ? { message } : {}),
  }
}

function decodeText(encoded: string | undefined): string | undefined {
  if (!encoded || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) return undefined
  const text = Buffer.from(encoded, 'base64').toString('utf8')
  // Control characters void the text; one line only.
  if ([...text].some(isControlCharacter)) return undefined
  return text.slice(0, MAX_MESSAGE)
}

function isControlCharacter(char: string): boolean {
  const code = char.charCodeAt(0)
  return code <= 0x1f || (code >= 0x7f && code <= 0x9f)
}
