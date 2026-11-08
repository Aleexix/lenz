import { create } from 'zustand'
import type {
  PaneAgent,
  PaneNode,
  Project,
  Space,
  SplitDirection,
  Tab,
  TerminalPane,
  Workspace,
} from '../../../shared/workspace'
import { EMPTY_WORKSPACE, mainSpaceId } from '../../../shared/workspace'
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

export interface NewTaskSpace {
  name: string
  path: string
  branch: string
  baseBranch: string
  /** Runs in the task's first tab; a plain shell when absent. */
  agent?: PaneAgent
}

interface WorkspaceState {
  workspace: Workspace
  loaded: boolean

  load(workspace: Workspace | null): void
  openProject(path: string): void
  removeProject(projectId: string): void
  selectProject(projectId: string): void
  selectSpace(spaceId: string): void
  /** Adds a task space (its worktree already exists) and shows it. */
  addTaskSpace(projectId: string, task: NewTaskSpace): void
  /** Closes a task space and its terminals; the worktree is removed by the caller. */
  removeSpace(spaceId: string): void

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
  /** Starts an agent in a new tab, or beside the focused pane, in the active space. */
  launchAgent(agent: PaneAgent, placement: 'tab' | 'split'): void
  /** Shows the project, space and tab that hold `paneId` and focuses it. */
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

function killSpace(space: Space): void {
  for (const tab of space.tabs) killTerminals(tab.root)
}

function folderName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path
}

function nextTabTitle(space: Space): string {
  const used = new Set(space.tabs.map((tab) => tab.title))
  let number = space.tabs.length + 1
  while (used.has(`Terminal ${number}`)) number++
  return `Terminal ${number}`
}

function makeTab(space: Space, agent?: PaneAgent): Tab {
  const pane = newTerminalPane(space.path, agent)
  return { id: newId('tab'), title: agent?.name ?? nextTabTitle(space), root: pane, focusedPaneId: pane.id }
}

// ── Lookups ────────────────────────────────────────────────────────────────

export function activeProject(workspace: Workspace): Project | null {
  return workspace.projects.find((project) => project.id === workspace.activeProjectId) ?? null
}

export function activeSpace(workspace: Workspace): Space | null {
  const project = activeProject(workspace)
  return project?.spaces.find((space) => space.id === project.activeSpaceId) ?? project?.spaces[0] ?? null
}

export function activeTab(workspace: Workspace): Tab | null {
  const space = activeSpace(workspace)
  return space?.tabs.find((tab) => tab.id === space.activeTabId) ?? null
}

export interface SpaceRef {
  project: Project
  space: Space
}

export function findSpace(workspace: Workspace, spaceId: string): SpaceRef | null {
  for (const project of workspace.projects) {
    const space = project.spaces.find((candidate) => candidate.id === spaceId)
    if (space) return { project, space }
  }
  return null
}

export interface AgentPaneRef extends SpaceRef {
  tab: Tab
  pane: TerminalPane & { agent: PaneAgent }
}

/** Every agent pane in the workspace, in sidebar order. */
export function agentPanes(workspace: Workspace): AgentPaneRef[] {
  return workspace.projects.flatMap((project) =>
    project.spaces.flatMap((space) =>
      space.tabs.flatMap((tab) =>
        terminalPanes(tab.root)
          .filter((pane): pane is AgentPaneRef['pane'] => pane.agent !== undefined)
          .map((pane) => ({ project, space, tab, pane })),
      ),
    ),
  )
}

// ── Immutable updates ──────────────────────────────────────────────────────

function mapProjects(workspace: Workspace, change: (project: Project) => Project): Workspace {
  return { ...workspace, projects: workspace.projects.map(change) }
}

function mapSpaces(workspace: Workspace, change: (space: Space, project: Project) => Space): Workspace {
  return mapProjects(workspace, (project) => ({
    ...project,
    spaces: project.spaces.map((space) => change(space, project)),
  }))
}

/** Applies `change` to the tab that holds `paneId`; null removes the tab. */
function mapTabWithPane(workspace: Workspace, paneId: string, change: (tab: Tab) => Tab | null): Workspace {
  return mapSpaces(workspace, (space) => {
    const tab = space.tabs.find((candidate) => findPane(candidate.root, paneId))
    if (!tab) return space
    const updated = change(tab)
    if (updated) return { ...space, tabs: space.tabs.map((t) => (t.id === tab.id ? updated : t)) }
    return withoutTab(space, tab.id)
  })
}

function mapActiveSpace(workspace: Workspace, change: (space: Space) => Space): Workspace {
  const target = activeSpace(workspace)
  if (!target) return workspace
  return mapSpaces(workspace, (space) => (space.id === target.id ? change(space) : space))
}

function withoutTab(space: Space, tabId: string): Space {
  const index = space.tabs.findIndex((tab) => tab.id === tabId)
  const tabs = space.tabs.filter((tab) => tab.id !== tabId)
  const activeTabId =
    space.activeTabId === tabId ? (tabs[Math.min(index, tabs.length - 1)]?.id ?? null) : space.activeTabId
  return { ...space, tabs, activeTabId }
}

function withTab(space: Space, tab: Tab): Space {
  return { ...space, tabs: [...space.tabs, tab], activeTabId: tab.id }
}

// ── Store ──────────────────────────────────────────────────────────────────

export const useWorkspace = create<WorkspaceState>()((set, get) => ({
  workspace: EMPTY_WORKSPACE,
  loaded: false,

  load: (workspace) => set({ workspace: workspace ?? EMPTY_WORKSPACE, loaded: true }),

  openProject: (path) =>
    set(({ workspace }) => {
      const existing = workspace.projects.find((project) => project.path === path)
      if (existing) return { workspace: { ...workspace, activeProjectId: existing.id } }
      const id = newId('proj')
      const main: Space = {
        id: mainSpaceId(id),
        kind: 'main',
        name: folderName(path),
        path,
        tabs: [],
        activeTabId: null,
      }
      const project: Project = {
        id,
        name: folderName(path),
        path,
        spaces: [withTab(main, makeTab(main))],
        activeSpaceId: main.id,
      }
      return {
        workspace: { ...workspace, projects: [...workspace.projects, project], activeProjectId: id },
      }
    }),

  removeProject: (projectId) =>
    set(({ workspace }) => {
      const project = workspace.projects.find((candidate) => candidate.id === projectId)
      if (!project) return {}
      for (const space of project.spaces) killSpace(space)
      const projects = workspace.projects.filter((candidate) => candidate.id !== projectId)
      const activeProjectId =
        workspace.activeProjectId === projectId ? (projects[0]?.id ?? null) : workspace.activeProjectId
      return { workspace: { ...workspace, projects, activeProjectId } }
    }),

  selectProject: (projectId) =>
    set(({ workspace }) => ({ workspace: { ...workspace, activeProjectId: projectId } })),

  selectSpace: (spaceId) =>
    set(({ workspace }) => {
      const ref = findSpace(workspace, spaceId)
      if (!ref) return {}
      return {
        workspace: {
          ...mapProjects(workspace, (p) => (p.id === ref.project.id ? { ...p, activeSpaceId: spaceId } : p)),
          activeProjectId: ref.project.id,
        },
      }
    }),

  addTaskSpace: (projectId, task) =>
    set(({ workspace }) => {
      const blank: Space = {
        id: newId('task'),
        kind: 'task',
        name: task.name,
        path: task.path,
        branch: task.branch,
        baseBranch: task.baseBranch,
        createdAt: Date.now(),
        tabs: [],
        activeTabId: null,
      }
      const space = withTab(blank, makeTab(blank, task.agent))
      return {
        workspace: {
          ...mapProjects(workspace, (p) =>
            p.id === projectId ? { ...p, spaces: [...p.spaces, space], activeSpaceId: space.id } : p,
          ),
          activeProjectId: projectId,
        },
      }
    }),

  removeSpace: (spaceId) =>
    set(({ workspace }) => {
      const ref = findSpace(workspace, spaceId)
      if (!ref || ref.space.kind === 'main') return {}
      killSpace(ref.space)
      return {
        workspace: mapProjects(workspace, (p) => {
          if (p.id !== ref.project.id) return p
          const spaces = p.spaces.filter((space) => space.id !== spaceId)
          return {
            ...p,
            spaces,
            activeSpaceId: p.activeSpaceId === spaceId ? mainSpaceId(p.id) : p.activeSpaceId,
          }
        }),
      }
    }),

  newTab: () =>
    set(({ workspace }) => ({ workspace: mapActiveSpace(workspace, (s) => withTab(s, makeTab(s))) })),

  closeTab: (tabId) =>
    set(({ workspace }) => ({
      workspace: mapSpaces(workspace, (space) => {
        const tab = space.tabs.find((candidate) => candidate.id === tabId)
        if (!tab) return space
        killTerminals(tab.root)
        return withoutTab(space, tabId)
      }),
    })),

  selectTab: (tabId) =>
    set(({ workspace }) => ({
      workspace: mapSpaces(workspace, (space) =>
        space.tabs.some((tab) => tab.id === tabId) ? { ...space, activeTabId: tabId } : space,
      ),
    })),

  cycleTab: (step) => {
    const space = activeSpace(get().workspace)
    if (!space || space.tabs.length < 2) return
    const index = space.tabs.findIndex((tab) => tab.id === space.activeTabId)
    const next = space.tabs[(index + step + space.tabs.length) % space.tabs.length]
    if (next) get().selectTab(next.id)
  },

  splitFocused: (direction) =>
    set(({ workspace }) => {
      const tab = activeTab(workspace)
      const space = activeSpace(workspace)
      if (!tab || !space) return {}
      const focused = findPane(tab.root, tab.focusedPaneId) ?? terminalPanes(tab.root)[0]
      if (!focused) return {}
      const added = newTerminalPane(focused.cwd || space.path)
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
      const space = activeSpace(workspace)
      if (!space) return {}
      const tab = activeTab(workspace)
      const focused = tab ? findPane(tab.root, tab.focusedPaneId) : null
      if (placement === 'split' && tab && focused) {
        const pane = newTerminalPane(focused.cwd || space.path, agent)
        return {
          workspace: mapTabWithPane(workspace, focused.id, (t) => ({
            ...t,
            root: splitPane(t.root, focused.id, 'horizontal', pane),
            focusedPaneId: pane.id,
          })),
        }
      }
      return { workspace: mapActiveSpace(workspace, (s) => withTab(s, makeTab(s, agent))) }
    }),

  revealPane: (paneId) =>
    set(({ workspace }) => {
      const ref = agentPanes(workspace).find(({ pane }) => pane.id === paneId)
      const target =
        ref ??
        workspace.projects
          .flatMap((project) =>
            project.spaces.flatMap((space) => space.tabs.map((tab) => ({ project, space, tab }))),
          )
          .find(({ tab }) => findPane(tab.root, paneId))
      if (!target) return {}
      const { project, space, tab } = target
      return {
        workspace: {
          ...mapProjects(workspace, (p) =>
            p.id !== project.id
              ? p
              : {
                  ...p,
                  activeSpaceId: space.id,
                  spaces: p.spaces.map((s) =>
                    s.id !== space.id
                      ? s
                      : {
                          ...s,
                          activeTabId: tab.id,
                          tabs: s.tabs.map((t) => (t.id === tab.id ? { ...t, focusedPaneId: paneId } : t)),
                        },
                  ),
                },
          ),
          activeProjectId: project.id,
        },
      }
    }),

  setSplitSizes: (tabId, splitId, sizes) =>
    set(({ workspace }) => ({
      workspace: mapSpaces(workspace, (space) => ({
        ...space,
        tabs: space.tabs.map((tab) =>
          tab.id === tabId ? { ...tab, root: setSplitSizes(tab.root, splitId, sizes) } : tab,
        ),
      })),
    })),
}))
