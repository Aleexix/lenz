import { FolderGit2, Users } from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'
import type { AppInfo } from '../../shared/app-info'
import lenzMark from './assets/lenz-mark-white.svg'

const TITLE_BAR_HEIGHT = 40

export function App() {
  const [info, setInfo] = useState<AppInfo | null>(null)

  useEffect(() => {
    void window.lenz.getAppInfo().then(setInfo)
  }, [])

  const isMac = info?.platform === 'darwin'

  return (
    <div className="flex h-full flex-col">
      <header
        className="drag-region flex shrink-0 items-center gap-2 border-b border-navy-800 bg-navy-950"
        style={{ height: TITLE_BAR_HEIGHT, paddingLeft: isMac ? 84 : 14 }}
      >
        <img src={lenzMark} alt="" className="h-4 w-auto" draggable={false} />
        <span className="text-sm font-semibold tracking-tight">Lenz</span>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-60 shrink-0 flex-col border-r border-navy-800 bg-navy-900/60">
          <SidebarSection icon={<FolderGit2 size={14} />} title="Proyectos" empty="Aún no hay proyectos" />
          <SidebarSection icon={<Users size={14} />} title="Squads" empty="Ningún agente trabajando" />
        </aside>

        <main className="flex flex-1 flex-col items-center justify-center gap-5 px-8 text-center">
          <img src={lenzMark} alt="Lenz" className="h-24 w-auto opacity-95" draggable={false} />
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight">El sexto sentido de tu código.</h1>
            <p className="text-electric-400">Lanza y orquesta squads de agentes de IA.</p>
          </div>
        </main>
      </div>

      <footer className="flex h-6 shrink-0 items-center justify-end border-t border-navy-800 px-3 font-mono text-[11px] text-ice/50">
        {info ? `v${info.version}` : null}
      </footer>
    </div>
  )
}

function SidebarSection(props: { icon: ReactNode; title: string; empty: string }) {
  return (
    <section className="px-3 pt-4">
      <h2 className="mb-2 flex items-center gap-1.5 text-[11px] font-medium tracking-wider text-ice/50 uppercase">
        {props.icon}
        {props.title}
      </h2>
      <p className="px-1 text-sm text-ice/40">{props.empty}</p>
    </section>
  )
}
