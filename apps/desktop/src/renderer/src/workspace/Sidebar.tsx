import { FolderGit2, Plus, Settings } from 'lucide-react'
import { SquadList } from '../agents/SquadList'
import { useUi } from '../ui-store'
import { ProjectTree } from './ProjectTree'
import { SHORTCUT_LABELS } from './shortcuts'
import { useWorkspace } from './workspace-store'

export async function pickAndOpenProject(): Promise<void> {
  const path = await window.lenz.dialog.openFolder()
  if (path) useWorkspace.getState().openProject(path)
}

export function Sidebar() {
  const hasProjects = useWorkspace((state) => state.workspace.projects.length > 0)

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-navy-800 bg-navy-900/60">
      <section className="max-h-[55%] overflow-y-auto px-2 pt-4">
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
        {!hasProjects ? <p className="px-1 text-sm text-ice/40">Aún no hay proyectos</p> : <ProjectTree />}
      </section>

      <SquadList />

      <div className="border-t border-navy-800 p-2">
        <button
          type="button"
          title={`Ajustes (${SHORTCUT_LABELS.openSettings})`}
          onClick={() => useUi.getState().openSettings()}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-ice/60 hover:bg-navy-800/60 hover:text-ice"
        >
          <Settings size={14} />
          Ajustes
        </button>
      </div>
    </aside>
  )
}
