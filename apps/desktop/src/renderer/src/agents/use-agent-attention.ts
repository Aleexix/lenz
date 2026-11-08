import type { AgentStatus } from '@lenz/protocol'
import { useEffect, useState } from 'react'
import { activeTab, agentPanes, useWorkspace } from '../workspace/workspace-store'
import { useAgentStatus } from './agent-store'

function useWindowFocused(): boolean {
  const [focused, setFocused] = useState(() => document.hasFocus())
  useEffect(() => {
    const onFocus = () => setFocused(true)
    const onBlur = () => setFocused(false)
    window.addEventListener('focus', onFocus)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('blur', onBlur)
    }
  }, [])
  return focused
}

/** The terminal the person is looking at right now, if any. */
function watchedTerminalId(windowFocused: boolean): string | null {
  if (!windowFocused) return null
  const tab = activeTab(useWorkspace.getState().workspace)
  if (!tab) return null
  const ref = agentPanes(useWorkspace.getState().workspace).find(({ pane }) => pane.id === tab.focusedPaneId)
  return ref?.pane.terminalId ?? null
}

const NOTIFY_ON: ReadonlySet<AgentStatus['state']> = new Set(['blocked', 'done', 'error'])

/**
 * Marks finished agents as seen when the person looks at them, and sends a
 * system notification when an agent needs them while they look elsewhere.
 */
export function useAgentAttention(): void {
  const windowFocused = useWindowFocused()
  const workspace = useWorkspace((state) => state.workspace)
  const statuses = useAgentStatus((state) => state.statuses)

  // Looking at a finished agent turns "Listo" into "Inactivo".
  // biome-ignore lint/correctness/useExhaustiveDependencies: workspace changes move focus; watchedTerminalId reads it from the store
  useEffect(() => {
    const watched = watchedTerminalId(windowFocused)
    if (watched && statuses[watched]?.state === 'done') useAgentStatus.getState().markSeen(watched)
  }, [windowFocused, workspace, statuses])

  useEffect(
    () =>
      useAgentStatus.subscribe((state, previous) => {
        for (const [terminalId, status] of Object.entries(state.statuses)) {
          const before = previous.statuses[terminalId]
          if (before?.state === status.state || !NOTIFY_ON.has(status.state)) continue
          // Statuses loaded at startup are old news.
          if (!before && Date.now() - status.updatedAt > 5_000) continue
          if (terminalId === watchedTerminalId(document.hasFocus())) continue
          const ref = agentPanes(useWorkspace.getState().workspace).find(
            ({ pane }) => pane.terminalId === terminalId,
          )
          if (!ref) continue
          const heading =
            status.state === 'blocked'
              ? `${ref.pane.agent.name} te necesita`
              : status.state === 'error'
                ? `${ref.pane.agent.name} tuvo un error`
                : `${ref.pane.agent.name} terminó`
          const notification = new Notification(heading, {
            body: status.message ?? ref.project.name,
            silent: false,
          })
          notification.onclick = () => {
            window.lenz.focusWindow()
            useWorkspace.getState().revealPane(ref.pane.id)
          }
        }
      }),
    [],
  )
}
