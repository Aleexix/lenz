/**
 * What the window shows: projects, their tabs and each tab's split layout.
 * Persisted by the main process as workspace.json; terminals themselves live
 * in lenzd and are referenced by id.
 */

export type SplitDirection = 'horizontal' | 'vertical'

export interface TerminalPane {
  kind: 'terminal'
  id: string
  /** lenzd terminal id; null until the pane has started one. */
  terminalId: string | null
  /** Folder for a fresh shell if the old terminal is gone (reboot, daemon restart). */
  cwd: string
  /** Present when the pane runs an agent instead of a shell. */
  agent?: PaneAgent
}

export interface PaneAgent {
  name: string
  profileId: string
  /** Claude Code session; a pane whose terminal is gone resumes it. */
  sessionId?: string
  /** First message, sent once when the agent starts for the first time. */
  prompt?: string
}

export interface SplitPane {
  kind: 'split'
  id: string
  /** horizontal = side by side, vertical = stacked */
  direction: SplitDirection
  children: PaneNode[]
  /** Percentages, one per child. */
  sizes: number[]
}

export type PaneNode = TerminalPane | SplitPane

export interface Tab {
  id: string
  title: string
  /** For `review` tabs, an empty split: they show the space's changes, not terminals. */
  root: PaneNode
  focusedPaneId: string
  view?: 'review'
}

/**
 * A folder with its own tabs. Every project has a `main` space (the folder
 * itself); each task adds one in its own git worktree and branch.
 */
export interface Space {
  id: string
  kind: 'main' | 'task'
  name: string
  path: string
  tabs: Tab[]
  activeTabId: string | null
  /** Task spaces: the branch the worktree is on, and the one it started from. */
  branch?: string
  baseBranch?: string
  createdAt?: number
}

export interface Project {
  id: string
  name: string
  /** The project's own folder (for git projects, the main checkout). */
  path: string
  spaces: Space[]
  activeSpaceId: string
}

export interface Workspace {
  version: 2
  projects: Project[]
  activeProjectId: string | null
}

export const EMPTY_WORKSPACE: Workspace = { version: 2, projects: [], activeProjectId: null }

export function mainSpaceId(projectId: string): string {
  return `main_${projectId}`
}

interface ProjectV1 {
  id: string
  name: string
  path: string
  tabs: Tab[]
  activeTabId: string | null
}

/** Reads any saved workspace version; null when the data is not a workspace. */
export function migrateWorkspace(data: unknown): Workspace | null {
  const raw = data as { version?: number; projects?: unknown; activeProjectId?: string | null } | null
  if (!raw || !Array.isArray(raw.projects)) return null
  if (raw.version === 2) return raw as Workspace
  if (raw.version !== 1) return null
  // v1: tabs lived on the project; they become its main space.
  const projects = (raw.projects as ProjectV1[]).map(
    (project): Project => ({
      id: project.id,
      name: project.name,
      path: project.path,
      activeSpaceId: mainSpaceId(project.id),
      spaces: [
        {
          id: mainSpaceId(project.id),
          kind: 'main',
          name: project.name,
          path: project.path,
          tabs: project.tabs ?? [],
          activeTabId: project.activeTabId ?? null,
        },
      ],
    }),
  )
  return { version: 2, projects, activeProjectId: raw.activeProjectId ?? null }
}
