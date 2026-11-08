/**
 * Turns Claude Code hook payloads into agent status.
 * Reference: https://code.claude.com/docs/en/hooks
 */
import type { AgentState, BlockKind } from '@lenz/protocol'

export interface HookPayload {
  hook_event_name?: string
  session_id?: string
  tool_name?: string
  tool_input?: Record<string, unknown>
  notification_type?: string
  message?: string
  last_assistant_message?: string
}

export interface HookUpdate {
  state: AgentState
  kind?: BlockKind
  message?: string
  sessionId?: string
}

const MAX_MESSAGE = 160

function oneLine(text: unknown): string | undefined {
  if (typeof text !== 'string') return undefined
  const line = text
    .split(/\r?\n/)
    .map((part) => part.trim())
    .find(Boolean)
  return line ? line.slice(0, MAX_MESSAGE) : undefined
}

/** "Bash: npm test", "Edit: src/app.ts", or just the tool name. */
function describeTool(payload: HookPayload): string | undefined {
  const tool = payload.tool_name
  if (!tool) return undefined
  const input = payload.tool_input ?? {}
  const detail =
    input.command ?? input.file_path ?? input.path ?? input.pattern ?? input.url ?? input.description
  const text = oneLine(detail)
  return text ? `${tool}: ${text}` : tool
}

/**
 * Null when the event says nothing about state. `current` lets events that
 * only make sense mid-turn (a finished tool) leave a finished turn alone.
 */
export function hookToStatus(payload: HookPayload, current: AgentState | undefined): HookUpdate | null {
  const sessionId = typeof payload.session_id === 'string' ? payload.session_id : undefined
  const withSession = (update: HookUpdate): HookUpdate => (sessionId ? { ...update, sessionId } : update)

  switch (payload.hook_event_name) {
    case 'SessionStart':
      return withSession({ state: 'idle' })
    case 'UserPromptSubmit':
      return withSession({ state: 'working' })
    case 'PreToolUse':
      return withSession({ state: 'working', message: describeTool(payload) })
    case 'PostToolUse':
    case 'PostToolUseFailure':
      return current === 'done' || current === 'idle' ? null : withSession({ state: 'working' })
    case 'PermissionRequest': {
      // AskUserQuestion goes through the permission flow, but it is a question.
      if (payload.tool_name === 'AskUserQuestion') {
        const questions = payload.tool_input?.questions
        const first = Array.isArray(questions)
          ? (questions[0] as { question?: unknown } | undefined)
          : undefined
        return withSession({
          state: 'blocked',
          kind: 'question',
          message: oneLine(first?.question) ?? 'Tiene una pregunta',
        })
      }
      const tool = describeTool(payload)
      return withSession({
        state: 'blocked',
        kind: 'permission',
        message: tool ? `Aprobar ${tool}` : undefined,
      })
    }
    case 'Notification':
      switch (payload.notification_type) {
        case 'permission_prompt':
          return withSession({ state: 'blocked', kind: 'permission', message: oneLine(payload.message) })
        case 'elicitation_dialog':
        case 'elicitation_url_dialog':
        case 'agent_needs_input':
          return withSession({ state: 'blocked', kind: 'question', message: oneLine(payload.message) })
        default:
          // idle_prompt and friends: the turn already ended (Stop) and that state stands.
          return null
      }
    case 'Stop':
      return withSession({ state: 'done', message: oneLine(payload.last_assistant_message) })
    case 'StopFailure':
      return withSession({
        state: 'error',
        message: oneLine(payload.message) ?? 'El turno terminó por un error',
      })
    case 'SessionEnd':
      return withSession({ state: 'idle' })
    default:
      return null
  }
}
