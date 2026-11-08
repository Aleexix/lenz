import type { AgentState, AgentStatus, Events } from '@lenz/protocol'
import { create } from 'zustand'

interface AgentStatusState {
  /** terminal id → latest status from lenzd */
  statuses: Record<string, AgentStatus>
  /** terminal id → updatedAt of the `done` status the person has already looked at */
  seen: Record<string, number>
  setStatus(terminalId: string, status: AgentStatus): void
  replaceAll(statuses: Record<string, AgentStatus>): void
  remove(terminalId: string): void
  markSeen(terminalId: string): void
}

export const useAgentStatus = create<AgentStatusState>()((set) => ({
  statuses: {},
  seen: {},
  setStatus: (terminalId, status) =>
    set(({ statuses }) => ({ statuses: { ...statuses, [terminalId]: status } })),
  replaceAll: (statuses) => set({ statuses }),
  remove: (terminalId) =>
    set(({ statuses, seen }) => {
      const { [terminalId]: _status, ...restStatuses } = statuses
      const { [terminalId]: _seen, ...restSeen } = seen
      return { statuses: restStatuses, seen: restSeen }
    }),
  markSeen: (terminalId) =>
    set((state) => {
      const status = state.statuses[terminalId]
      if (status?.state !== 'done' || state.seen[terminalId] === status.updatedAt) return {}
      return { seen: { ...state.seen, [terminalId]: status.updatedAt } }
    }),
}))

/**
 * What the squad list shows. A finished turn reads "Listo" until the person
 * looks at it, then "Inactivo" (Herdr's done/idle split).
 */
export type DisplayState = AgentState | 'starting'

export function displayState(
  terminalId: string | null,
  statuses: Record<string, AgentStatus>,
  seen: Record<string, number>,
): DisplayState {
  const status = terminalId ? statuses[terminalId] : undefined
  if (!status) return 'starting'
  if (status.state === 'done' && seen[terminalId as string] === status.updatedAt) return 'idle'
  return status.state
}

export const STATE_LABEL: Record<DisplayState, string> = {
  starting: 'Iniciando',
  working: 'Trabajando',
  blocked: 'Te necesita',
  done: 'Listo',
  idle: 'Inactivo',
  error: 'Error',
}

/** Which state wins when several agents share a tab: the one that needs the person most. */
const URGENCY: Record<DisplayState, number> = {
  blocked: 5,
  error: 4,
  done: 3,
  working: 2,
  starting: 1,
  idle: 0,
}

export function mostUrgent(states: DisplayState[]): DisplayState | null {
  return states.reduce<DisplayState | null>(
    (best, state) => (best === null || URGENCY[state] > URGENCY[best] ? state : best),
    null,
  )
}

/** Loads current statuses from lenzd and keeps them in sync. Returns an unsubscribe. */
export function syncAgentStatus(): () => void {
  const { daemon } = window.lenz
  const store = useAgentStatus.getState()

  const load = () =>
    daemon
      .request('terminal.list', {})
      .then((terminals) => {
        const statuses: Record<string, AgentStatus> = {}
        for (const terminal of terminals) if (terminal.status) statuses[terminal.id] = terminal.status
        store.replaceAll(statuses)
      })
      .catch(() => undefined)

  void load()
  const offEvent = daemon.onEvent((name, payload) => {
    if (name === 'agent.status') {
      const { id, status } = payload as Events['agent.status']
      useAgentStatus.getState().setStatus(id, status)
    } else if (name === 'terminal.exit') {
      useAgentStatus.getState().remove((payload as Events['terminal.exit']).id)
    }
  })
  const offReconnected = daemon.onReconnected(() => void load())
  return () => {
    offEvent()
    offReconnected()
  }
}
