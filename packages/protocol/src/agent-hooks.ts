/** Claude Code hook events Lenz subscribes to when it launches an agent. */
export const CLAUDE_HOOK_EVENTS = [
  'SessionStart',
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'PermissionRequest',
  'Notification',
  'Stop',
  'StopFailure',
  'SessionEnd',
] as const

export function hookUrl(port: number, token: string): string {
  return `http://127.0.0.1:${port}/hooks/${token}`
}
