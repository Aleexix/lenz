import { Columns2, Plus, Rows2, SquareTerminal, X } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Project } from '../../../shared/workspace'
import { SHORTCUT_LABELS } from './shortcuts'
import { useWorkspace } from './workspace-store'

export function TabBar({ project }: { project: Project }) {
  const { selectTab, closeTab, newTab, splitFocused } = useWorkspace.getState()

  return (
    <div className="flex h-9 shrink-0 items-stretch border-b border-navy-800 bg-navy-950">
      <div className="flex min-w-0 flex-1 items-stretch overflow-x-auto">
        {project.tabs.map((tab) => {
          const active = tab.id === project.activeTabId
          return (
            <div
              key={tab.id}
              className={`group flex max-w-52 min-w-28 items-center border-r border-navy-800 pr-1.5 text-[13px] ${
                active ? 'bg-navy-900 text-ice' : 'text-ice/55 hover:bg-navy-900/50 hover:text-ice/80'
              }`}
            >
              <button
                type="button"
                className="flex h-full min-w-0 flex-1 cursor-default items-center gap-2 pl-3 text-left"
                onMouseDown={() => selectTab(tab.id)}
              >
                <SquareTerminal size={13} className={`shrink-0 ${active ? 'text-electric-400' : ''}`} />
                <span className="truncate">{tab.title}</span>
              </button>
              <button
                type="button"
                title="Cerrar pestaña"
                className="rounded p-0.5 opacity-0 group-hover:opacity-100 hover:bg-navy-800"
                onClick={() => closeTab(tab.id)}
              >
                <X size={13} />
              </button>
            </div>
          )
        })}
        <IconButton title={`Nueva pestaña (${SHORTCUT_LABELS.newTab})`} onClick={newTab}>
          <Plus size={15} />
        </IconButton>
      </div>
      <div className="flex items-center gap-0.5 px-2">
        <IconButton
          title={`Dividir a la derecha (${SHORTCUT_LABELS.splitRight})`}
          onClick={() => splitFocused('horizontal')}
        >
          <Columns2 size={15} />
        </IconButton>
        <IconButton
          title={`Dividir hacia abajo (${SHORTCUT_LABELS.splitDown})`}
          onClick={() => splitFocused('vertical')}
        >
          <Rows2 size={15} />
        </IconButton>
      </div>
    </div>
  )
}

function IconButton(props: { title: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={props.title}
      onClick={props.onClick}
      className="flex items-center justify-center rounded px-2 text-ice/55 hover:bg-navy-900 hover:text-ice"
    >
      {props.children}
    </button>
  )
}
