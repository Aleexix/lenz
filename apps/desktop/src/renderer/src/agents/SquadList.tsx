import { Plus, Users } from 'lucide-react'
import { useUi } from '../ui-store'
import { activeProject, agentPanes, useWorkspace } from '../workspace/workspace-store'
import { displayState, STATE_LABEL, useAgentStatus } from './agent-store'
import { StateDot } from './StateDot'

export function SquadList() {
  const workspace = useWorkspace((state) => state.workspace)
  const revealPane = useWorkspace((state) => state.revealPane)
  const statuses = useAgentStatus((state) => state.statuses)
  const seen = useAgentStatus((state) => state.seen)
  const openDialog = useUi((state) => state.openDialog)
  const agents = agentPanes(workspace)
  const hasProject = activeProject(workspace) !== null

  return (
    <section className="flex min-h-0 flex-1 flex-col px-2 pt-5">
      <div className="mb-1.5 flex items-center justify-between px-1">
        <h2 className="flex items-center gap-1.5 text-[11px] font-medium tracking-wider text-ice/50 uppercase">
          <Users size={14} />
          Squad
        </h2>
        <button
          type="button"
          title="Nuevo agente"
          disabled={!hasProject}
          onClick={() => openDialog('newAgent')}
          className="rounded p-0.5 text-ice/50 hover:bg-navy-800 hover:text-ice disabled:opacity-30"
        >
          <Plus size={14} />
        </button>
      </div>

      {agents.length === 0 ? (
        <p className="px-1 text-sm text-ice/40">Ningún agente trabajando</p>
      ) : (
        <ul className="min-h-0 space-y-px overflow-y-auto pb-2">
          {agents.map(({ project, space, pane }) => {
            const state = displayState(pane.terminalId, statuses, seen)
            const status = pane.terminalId ? statuses[pane.terminalId] : undefined
            const detail = status?.message ? `${STATE_LABEL[state]} · ${status.message}` : STATE_LABEL[state]
            const focused =
              workspace.activeProjectId === project.id &&
              project.activeSpaceId === space.id &&
              space.tabs.some((tab) => tab.id === space.activeTabId && tab.focusedPaneId === pane.id)
            const where = space.kind === 'task' ? `${project.name} · ${space.name}` : project.name
            return (
              <li key={pane.id}>
                <button
                  type="button"
                  onClick={() => revealPane(pane.id)}
                  title={`${pane.agent.name} · ${STATE_LABEL[state]}${status?.message ? `\n${status.message}` : ''}`}
                  className={`flex w-full items-start gap-2.5 rounded-md px-2 py-1.5 text-left ${
                    focused ? 'bg-navy-800' : 'hover:bg-navy-800/50'
                  }`}
                >
                  <StateDot state={state} className="mt-1.5" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-1.5">
                      <span
                        className={`truncate text-sm ${state === 'blocked' ? 'text-amber-200' : 'text-ice'}`}
                      >
                        {pane.agent.name}
                      </span>
                      <span className="truncate text-[11px] text-ice/35">{where}</span>
                    </span>
                    <span className="block truncate text-xs text-ice/50">{detail}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
