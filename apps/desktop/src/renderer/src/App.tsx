import { FolderOpen } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { AppInfo, DaemonStatus } from '../../shared/app-info'
import { syncAgentStatus } from './agents/agent-store'
import { NewAgentDialog } from './agents/NewAgentDialog'
import { useAgentAttention } from './agents/use-agent-attention'
import lenzMark from './assets/lenz-mark-white.svg'
import { SettingsDialog } from './settings/SettingsDialog'
import { useUi } from './ui-store'
import { PaneTree } from './workspace/PaneTree'
import { pickAndOpenProject, Sidebar } from './workspace/Sidebar'
import { matchShortcut, type ShortcutAction } from './workspace/shortcuts'
import { TabBar } from './workspace/TabBar'
import { activeProject, useWorkspace } from './workspace/workspace-store'

const TITLE_BAR_HEIGHT = 40
const SAVE_DELAY_MS = 300

const SHORTCUT_HANDLERS: Record<ShortcutAction, () => void> = {
  newTab: () => useWorkspace.getState().newTab(),
  newAgent: () => {
    if (activeProject(useWorkspace.getState().workspace)) useUi.getState().openDialog('newAgent')
  },
  closePane: () => useWorkspace.getState().closeFocusedPane(),
  splitRight: () => useWorkspace.getState().splitFocused('horizontal'),
  splitDown: () => useWorkspace.getState().splitFocused('vertical'),
  nextTab: () => useWorkspace.getState().cycleTab(1),
  prevTab: () => useWorkspace.getState().cycleTab(-1),
  openSettings: () => useUi.getState().openSettings(),
}

function usePersistedWorkspace(): void {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    let disposed = false
    let unsubscribe = () => {}

    void window.lenz.workspace.load().then((saved) => {
      if (disposed) return
      useWorkspace.getState().load(saved)
      unsubscribe = useWorkspace.subscribe((state, previous) => {
        if (state.workspace === previous.workspace) return
        clearTimeout(timer)
        timer = setTimeout(() => void window.lenz.workspace.save(state.workspace), SAVE_DELAY_MS)
      })
    })

    const flush = () => {
      if (!useWorkspace.getState().loaded) return
      clearTimeout(timer)
      window.lenz.workspace.saveSync(useWorkspace.getState().workspace)
    }
    window.addEventListener('beforeunload', flush)
    return () => {
      disposed = true
      clearTimeout(timer)
      unsubscribe()
      window.removeEventListener('beforeunload', flush)
    }
  }, [])
}

function useShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const action = matchShortcut(event)
      if (!action) return
      event.preventDefault()
      event.stopPropagation()
      SHORTCUT_HANDLERS[action]()
    }
    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [])
}

function useDaemonStatus(): DaemonStatus {
  const [status, setStatus] = useState<DaemonStatus>('connecting')
  useEffect(() => {
    void window.lenz.daemon.status().then(setStatus)
    return window.lenz.daemon.onStatus(setStatus)
  }, [])
  return status
}

export function App() {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const loaded = useWorkspace((state) => state.loaded)
  const project = useWorkspace((state) => activeProject(state.workspace))
  const daemonStatus = useDaemonStatus()

  usePersistedWorkspace()
  useShortcuts()
  useAgentAttention()
  useEffect(() => syncAgentStatus(), [])

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
        {project && (
          <span className="truncate text-sm text-ice/45">
            <span className="px-1.5 text-ice/25">/</span>
            {project.name}
          </span>
        )}
      </header>

      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="flex min-w-0 flex-1 flex-col">
          {loaded && project ? <ProjectView /> : loaded ? <Welcome /> : null}
        </main>
      </div>

      <NewAgentDialog />
      <SettingsDialog />

      <footer className="flex h-6 shrink-0 items-center justify-between border-t border-navy-800 px-3 font-mono text-[11px] text-ice/50">
        <DaemonIndicator status={daemonStatus} />
        <span>{info ? `v${info.version}` : null}</span>
      </footer>
    </div>
  )
}

function ProjectView() {
  const project = useWorkspace((state) => activeProject(state.workspace))
  if (!project) return null
  const tab = project.tabs.find((candidate) => candidate.id === project.activeTabId)

  return (
    <>
      <TabBar project={project} />
      <div className="relative min-h-0 flex-1">
        {tab ? (
          // Only the visible tab is mounted; switching back re-attaches from lenzd's snapshot.
          <PaneTree key={tab.id} tab={tab} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-ice/50">
            <p className="text-sm">No hay terminales abiertas en {project.name}.</p>
            <button
              type="button"
              onClick={() => useWorkspace.getState().newTab()}
              className="rounded-md bg-electric-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-electric-400"
            >
              Nueva terminal
            </button>
          </div>
        )}
      </div>
    </>
  )
}

function Welcome() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 px-8 text-center">
      <img src={lenzMark} alt="Lenz" className="h-24 w-auto opacity-95" draggable={false} />
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">El sexto sentido de tu código.</h1>
        <p className="text-electric-400">Lanza y orquesta squads de agentes de IA.</p>
      </div>
      <button
        type="button"
        onClick={() => void pickAndOpenProject()}
        className="mt-2 flex items-center gap-2 rounded-md bg-electric-600 px-4 py-2 text-sm font-medium text-white hover:bg-electric-400"
      >
        <FolderOpen size={16} />
        Abrir proyecto
      </button>
    </div>
  )
}

const STATUS_LABEL: Record<DaemonStatus, string> = {
  connected: 'lenzd conectado',
  connecting: 'conectando con lenzd…',
  disconnected: 'lenzd desconectado',
}

function DaemonIndicator({ status }: { status: DaemonStatus }) {
  const color =
    status === 'connected' ? 'bg-emerald-400' : status === 'connecting' ? 'bg-amber-400' : 'bg-red-400'
  return (
    <span className="flex items-center gap-1.5">
      <span className={`size-1.5 rounded-full ${color}`} />
      {STATUS_LABEL[status]}
    </span>
  )
}
