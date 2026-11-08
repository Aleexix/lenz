import { FolderGit2, KeyRound, Plus, X } from 'lucide-react'
import type { Project } from '../../../shared/workspace'
import { SquadList } from '../agents/SquadList'
import { useUi } from '../ui-store'
import { useWorkspace } from './workspace-store'

export async function pickAndOpenProject(): Promise<void> {
  const path = await window.lenz.dialog.openFolder()
  if (path) useWorkspace.getState().openProject(path)
}

async function confirmRemove(project: Project): Promise<void> {
  const ok = await window.lenz.dialog.confirm(
    `¿Quitar "${project.name}" de Lenz?`,
    'Se cerrarán sus terminales. La carpeta no se borra.',
    'Quitar',
  )
  if (ok) useWorkspace.getState().removeProject(project.id)
}

export function Sidebar() {
  const projects = useWorkspace((state) => state.workspace.projects)
  const activeProjectId = useWorkspace((state) => state.workspace.activeProjectId)
  const selectProject = useWorkspace((state) => state.selectProject)

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-navy-800 bg-navy-900/60">
      <section className="px-2 pt-4">
        <div className="mb-1.5 flex items-center justify-between px-1">
          <h2 className="flex items-center gap-1.5 text-[11px] font-medium tracking-wider text-ice/50 uppercase">
            <FolderGit2 size={14} />
            Proyectos
          </h2>
          <button
            type="button"
            title="Abrir proyecto"
            onClick={() => void pickAndOpenProject()}
            className="rounded p-0.5 text-ice/50 hover:bg-navy-800 hover:text-ice"
          >
            <Plus size={14} />
          </button>
        </div>
        {projects.length === 0 ? (
          <p className="px-1 text-sm text-ice/40">Aún no hay proyectos</p>
        ) : (
          <ul className="space-y-px">
            {projects.map((project) => {
              const active = project.id === activeProjectId
              return (
                <li key={project.id}>
                  <div
                    className={`group flex items-center rounded-md pr-2 text-sm ${
                      active ? 'bg-navy-800 text-ice' : 'text-ice/70 hover:bg-navy-800/50'
                    }`}
                  >
                    <button
                      type="button"
                      title={project.path}
                      onMouseDown={() => selectProject(project.id)}
                      className="flex min-w-0 flex-1 cursor-default items-center gap-2 py-1.5 pl-2 text-left"
                    >
                      <span
                        className={`size-1.5 shrink-0 rounded-full ${active ? 'bg-electric-400' : 'bg-ice/25'}`}
                      />
                      <span className="truncate">{project.name}</span>
                    </button>
                    <span className="text-[11px] text-ice/35 group-hover:hidden">{project.tabs.length}</span>
                    <button
                      type="button"
                      title="Quitar proyecto"
                      className="hidden rounded p-0.5 text-ice/50 group-hover:block hover:bg-navy-700 hover:text-ice"
                      onClick={() => void confirmRemove(project)}
                    >
                      <X size={13} />
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <SquadList />

      <div className="border-t border-navy-800 p-2">
        <button
          type="button"
          onClick={() => useUi.getState().openDialog('providers')}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-ice/60 hover:bg-navy-800/60 hover:text-ice"
        >
          <KeyRound size={14} />
          Proveedores
        </button>
      </div>
    </aside>
  )
}
