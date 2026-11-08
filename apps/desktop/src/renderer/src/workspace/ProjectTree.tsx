import { GitBranch, GitBranchPlus, X } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Project, Space } from '../../../shared/workspace'
import { deleteTask } from '../tasks/delete-task'
import { useTaskSummaries } from '../tasks/task-summaries'
import { useUi } from '../ui-store'
import { SHORTCUT_LABELS } from './shortcuts'
import { useWorkspace } from './workspace-store'

async function confirmRemove(project: Project): Promise<void> {
  const tasks = project.spaces.filter((space) => space.kind === 'task').length
  const ok = await window.lenz.dialog.confirm(
    `¿Quitar "${project.name}" de Lenz?`,
    [
      'Se cerrarán sus terminales y agentes. La carpeta no se borra.',
      tasks > 0 ? `Sus ${tasks} tareas dejan de aparecer, pero sus worktrees y ramas siguen en disco.` : '',
    ]
      .filter(Boolean)
      .join('\n\n'),
    'Quitar',
  )
  if (ok) useWorkspace.getState().removeProject(project.id)
}

function HoverButton(props: { title: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={props.title}
      onClick={props.onClick}
      className="hidden rounded p-0.5 text-ice/50 group-hover:block hover:bg-navy-700 hover:text-ice"
    >
      {props.children}
    </button>
  )
}

function TaskBadge({ space }: { space: Space }) {
  const summary = useTaskSummaries((state) => state.summaries[space.id])
  if (!summary || (summary.changed === 0 && summary.ahead === 0)) return null
  return (
    <span className="flex shrink-0 items-center gap-1 font-mono text-[10px] group-hover:hidden">
      {summary.changed > 0 ? (
        <span className="text-amber-300" title={`${summary.changed} archivos con cambios sin commit`}>
          ●{summary.changed}
        </span>
      ) : null}
      {summary.ahead > 0 ? (
        <span
          className="text-emerald-300"
          title={`${summary.ahead} commits por delante de ${space.baseBranch}`}
        >
          ↑{summary.ahead}
        </span>
      ) : null}
    </span>
  )
}

export function ProjectTree() {
  const projects = useWorkspace((state) => state.workspace.projects)
  const activeProjectId = useWorkspace((state) => state.workspace.activeProjectId)
  const selectSpace = useWorkspace((state) => state.selectSpace)
  const openNewTask = useUi((state) => state.openNewTask)

  return (
    <ul className="space-y-px">
      {projects.map((project) => {
        const projectActive = project.id === activeProjectId
        const main = project.spaces.find((space) => space.kind === 'main')
        const tasks = project.spaces.filter((space) => space.kind === 'task')
        const mainActive = projectActive && project.activeSpaceId === main?.id
        return (
          <li key={project.id}>
            <div
              className={`group flex items-center gap-0.5 rounded-md pr-1.5 text-sm ${
                mainActive
                  ? 'bg-navy-800 text-ice'
                  : projectActive
                    ? 'text-ice'
                    : 'text-ice/70 hover:bg-navy-800/50'
              }`}
            >
              <button
                type="button"
                title={project.path}
                onMouseDown={() => main && selectSpace(main.id)}
                className="flex min-w-0 flex-1 cursor-default items-center gap-2 py-1.5 pl-2 text-left"
              >
                <span
                  className={`size-1.5 shrink-0 rounded-full ${projectActive ? 'bg-electric-400' : 'bg-ice/25'}`}
                />
                <span className="truncate">{project.name}</span>
              </button>
              <HoverButton
                title={`Nueva tarea (${SHORTCUT_LABELS.newTask})`}
                onClick={() => openNewTask(project.id)}
              >
                <GitBranchPlus size={13} />
              </HoverButton>
              <HoverButton title="Quitar proyecto" onClick={() => void confirmRemove(project)}>
                <X size={13} />
              </HoverButton>
            </div>

            {tasks.length > 0 ? (
              <ul className="mt-px ml-3 space-y-px border-l border-navy-700 pl-1.5">
                {tasks.map((space) => {
                  const active = projectActive && project.activeSpaceId === space.id
                  return (
                    <li key={space.id}>
                      <div
                        className={`group flex items-center gap-1 rounded-md pr-1.5 text-[13px] ${
                          active ? 'bg-navy-800 text-ice' : 'text-ice/65 hover:bg-navy-800/50'
                        }`}
                      >
                        <button
                          type="button"
                          title={`${space.branch}\n${space.path}`}
                          onMouseDown={() => selectSpace(space.id)}
                          className="flex min-w-0 flex-1 cursor-default items-center gap-1.5 py-1 pl-1.5 text-left"
                        >
                          <GitBranch
                            size={12}
                            className={`shrink-0 ${active ? 'text-electric-400' : 'text-ice/40'}`}
                          />
                          <span className="truncate">{space.name}</span>
                        </button>
                        <TaskBadge space={space} />
                        <HoverButton title="Borrar tarea" onClick={() => void deleteTask(project, space)}>
                          <X size={13} />
                        </HoverButton>
                      </div>
                    </li>
                  )
                })}
              </ul>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
