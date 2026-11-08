import { create } from 'zustand'
import type {
  PaneAgent,
  PaneNode,
  Project,
  SplitDirection,
  Tab,
  TerminalPane,
  Workspace,
} from '../../../shared/workspace'
import { EMPTY_WORKSPACE } from '../../../shared/workspace'
import {
  findPane,
  newId,
  newTerminalPane,
  removePane,
  setSplitSizes,
  splitPane,
  terminalPanes,
  updateTerminalPane,
} from './pane-tree'

interface WorkspaceState {
  workspace: Workspace
  loaded: boolean

  load(workspace: Workspace | null): void
  openProject(path: string): void
  removeProject(projectId: string): void
  selectProject(projectId: string): void

  newTab(): void
  closeTab(tabId: string): void
  selectTab(tabId: string): void
  cycleTab(step: 1 | -1): void

  splitFocused(direction: SplitDirection): void
  /** `killTerminal` is false when the terminal already exited on its own. */
  closePane(paneId: string, killTerminal?: boolean): void
  closeFocusedPane(): void
  focusPane(paneId: string): void
  setTerminalId(paneId: string, terminalId: string, agent?: PaneAgent): void
  /** Starts an agent in a new tab, or beside the focused pane. */
  launchAgent(agent: PaneAgent, placement: 'tab' | 'split'): void
  /** Shows the project and tab that hold `paneId` and focuses it. */
  revealPane(paneId: string): void
  setSplitSizes(tabId: string, splitId: string, sizes: number[]): void
}

function killTerminals(root: PaneNode): void {
  for (const pane of terminalPanes(root)) {
    if (pane.terminalId) {
      void window.lenz.daemon.request('terminal.kill', { id: pane.terminalId }).catch(() => undefined)
    }
  }
}

function folderName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path
}

function nextTabTitle(project: Project): string {
  const used = new Set(project.tabs.map((tab) => tab.title))
  let number = project.tabs.length + 1
  while (used.has(`Terminal ${number}`)) number++
  return `Terminal ${number}`
}

function makeTab(project: Project): Tab {
  const pane = newTerminalPane(project.path)
  return { id: newId('tab'), title: nextTabTitle(project), root: pane, focusedPaneId: pane.id }
}

export interface AgentPaneRef {
  project: Project
  tab: Tab
  pane: TerminalPane & { agent: PaneAgent }
}

/** Every agent pane in the workspace, in sidebar order. */
export function agentPanes(workspace: Workspace): AgentPaneRef[] {
  return workspace.projects.flatMap((project) =>
    project.tabs.flatMap((tab) =>
      terminalPanes(tab.root)
        .filter((pane): pane is AgentPaneRef['pane'] => pane.agent !== undefined)
        .map((pane) => ({ project, tab, pane })),
    ),
  )
}

export function activeProject(workspace: Workspace): Project | null {
  return workspace.projects.find((project) => project.id === workspace.activeProjectId) ?? null
}

export function activeTab(workspace: Workspace): Tab | null {
  const project = activeProject(workspace)
  return project?.tabs.find((tab) => tab.id === project.activeTabId) ?? null
}

/** Applies `change` to the project and tab that hold `paneId`. */
function mapTabWithPane(
  workspace: Workspace,
  paneId: string,
  change: (tab: Tab, project: Project) => Tab | null,
) {
  return mapProjects(workspace, (project) => {
    const tab = project.tabs.find((candidate) => findPane(candidate.root, paneId))
    if (!tab) return project
    const updated = change(tab, project)
    if (updated) return { ...project, tabs: project.tabs.map((t) => (t.id === tab.id ? updated : t)) }
    return withoutTab(project, tab.id)
  })
}

function mapProjects(workspace: Workspace, change: (project: Project) => Project): Workspace {
  return { ...workspace, projects: workspace.projects.map(change) }
}

function withoutTab(project: Project, tabId: string): Project {
  const index = project.tabs.findIndex((tab) => tab.id === tabId)
  const tabs = project.tabs.filter((tab) => tab.id !== tabId)
  const activeTabId =
    project.activeTabId === tabId ? (tabs[Math.min(index, tabs.length - 1)]?.id ?? null) : project.activeTabId
  return { ...project, tabs, activeTabId }
}

export const useWorkspace = create<WorkspaceState>()((set, get) => ({
  workspace: EMPTY_WORKSPACE,
  loaded: false,

  load: (workspace) => set({ workspace: workspace ?? EMPTY_WORKSPACE, loaded: true }),

  openProject: (path) =>
    set(({ workspace }) => {
      const existing = workspace.projects.find((project) => project.path === path)
      if (existing) return { workspace: { ...workspace, activeProjectId: existing.id } }
      const project: Project = {
        id: newId('proj'),
        name: folderName(path),
        path,
        tabs: [],
        activeTabId: null,
      }
      const tab = makeTab(project)
      const opened = { ...project, tabs: [tab], activeTabId: tab.id }
      return {
        workspace: { ...workspace, projects: [...workspace.projects, opened], activeProjectId: opened.id },
      }
    }),

  removeProject: (projectId) =>
    set(({ workspace }) => {
      const project = workspace.projects.find((candidate) => candidate.id === projectId)
      if (!project) return {}
      for (const tab of project.tabs) killTerminals(tab.root)
      const projects = workspace.projects.filter((candidate) => candidate.id !== projectId)
      const activeProjectId =
        workspace.activeProjectId === projectId ? (projects[0]?.id ?? null) : workspace.activeProjectId
      return { workspace: { ...workspace, projects, activeProjectId } }
    }),

  selectProject: (projectId) =>
    set(({ workspace }) => ({ workspace: { ...workspace, activeProjectId: projectId } })),

  newTab: () =>
    set(({ workspace }) => {
      const project = activeProject(workspace)
      if (!project) return {}
      const tab = makeTab(project)
      return {
        workspace: mapProjects(workspace, (p) =>
          p.id === project.id ? { ...p, tabs: [...p.tabs, tab], activeTabId: tab.id } : p,
        ),
      }
    }),

  closeTab: (tabId) =>
    set(({ workspace }) => ({
      workspace: mapProjects(workspace, (project) => {
        const tab = project.tabs.find((candidate) => candidate.id === tabId)
        if (!tab) return project
        killTerminals(tab.root)
        return withoutTab(project, tabId)
      }),
    })),

  selectTab: (tabId) =>
    set(({ workspace }) => ({
      workspace: mapProjects(workspace, (project) =>
        project.tabs.some((tab) => tab.id === tabId) ? { ...project, activeTabId: tabId } : project,
      ),
    })),

  cycleTab: (step) => {
    const project = activeProject(get().workspace)
    if (!project || project.tabs.length < 2) return
    const index = project.tabs.findIndex((tab) => tab.id === project.activeTabId)
    const next = project.tabs[(index + step + project.tabs.length) % project.tabs.length]
    if (next) get().selectTab(next.id)
  },

  splitFocused: (direction) =>
    set(({ workspace }) => {
      const tab = activeTab(workspace)
      const project = activeProject(workspace)
      if (!tab || !project) return {}
      const focused = findPane(tab.root, tab.focusedPaneId) ?? terminalPanes(tab.root)[0]
      if (!focused) return {}
      const added = newTerminalPane(focused.cwd || project.path)
      return {
        workspace: mapTabWithPane(workspace, focused.id, (t) => ({
          ...t,
          root: splitPane(t.root, focused.id, direction, added),
          focusedPaneId: added.id,
        })),
      }
    }),

  closePane: (paneId, killTerminal = true) =>
    set(({ workspace }) => ({
      workspace: mapTabWithPane(workspace, paneId, (tab) => {
        const pane = findPane(tab.root, paneId)
        if (killTerminal && pane) killTerminals(pane)
        const root = removePane(tab.root, paneId)
        if (!root) return null
        const panes = terminalPanes(root)
        const focusedPaneId = findPane(root, tab.focusedPaneId) ? tab.focusedPaneId : (panes[0]?.id ?? '')
        return { ...tab, root, focusedPaneId }
      }),
    })),

  closeFocusedPane: () => {
    const tab = activeTab(get().workspace)
    if (tab) get().closePane(tab.focusedPaneId)
  },

  focusPane: (paneId) =>
    set(({ workspace }) => {
      const tab = activeTab(workspace)
      if (tab?.focusedPaneId === paneId) return {}
      return { workspace: mapTabWithPane(workspace, paneId, (t) => ({ ...t, focusedPaneId: paneId })) }
    }),

  setTerminalId: (paneId, terminalId, agent) =>
    set(({ workspace }) => ({
      workspace: mapTabWithPane(workspace, paneId, (tab) => ({
        ...tab,
        root: updateTerminalPane(tab.root, paneId, agent ? { terminalId, agent } : { terminalId }),
      })),
    })),

  launchAgent: (agent, placement) =>
    set(({ workspace }) => {
      const project = activeProject(workspace)
      if (!project) return {}
      const tab = activeTab(workspace)
      const focused = tab ? findPane(tab.root, tab.focusedPaneId) : null
      const pane = newTerminalPane(focused?.cwd || project.path, agent)
      if (placement === 'split' && tab && focused) {
        return {
          workspace: mapTabWithPane(workspace, focused.id, (t) => ({
            ...t,
            root: splitPane(t.root, focused.id, 'horizontal', pane),
            focusedPaneId: pane.id,
          })),
        }
      }
      const newTab: Tab = { id: newId('tab'), title: agent.name, root: pane, focusedPaneId: pane.id }
      return {
        workspace: mapProjects(workspace, (p) =>
          p.id === project.id ? { ...p, tabs: [...p.tabs, newTab], activeTabId: newTab.id } : p,
        ),
      }
    }),

  revealPane: (paneId) =>
    set(({ workspace }) => {
      const project = workspace.projects.find((p) => p.tabs.some((t) => findPane(t.root, paneId)))
      const tab = project?.tabs.find((t) => findPane(t.root, paneId))
      if (!project || !tab) return {}
      return {
        workspace: {
          ...mapProjects(workspace, (p) =>
            p.id === project.id
              ? {
                  ...p,
                  activeTabId: tab.id,
                  tabs: p.tabs.map((t) => (t.id === tab.id ? { ...t, focusedPaneId: paneId } : t)),
                }
              : p,
          ),
          activeProjectId: project.id,
        },
      }
    }),

  setSplitSizes: (tabId, splitId, sizes) =>
    set(({ workspace }) => ({
      workspace: mapProjects(workspace, (project) => ({
        ...project,
        tabs: project.tabs.map((tab) =>
          tab.id === tabId ? { ...tab, root: setSplitSizes(tab.root, splitId, sizes) } : tab,
        ),
      })),
    })),
}))
