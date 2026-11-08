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
  root: PaneNode
  focusedPaneId: string
}

export interface Project {
  id: string
  name: string
  path: string
  tabs: Tab[]
  activeTabId: string | null
}

export interface Workspace {
  version: 1
  projects: Project[]
  activeProjectId: string | null
}

export const EMPTY_WORKSPACE: Workspace = { version: 1, projects: [], activeProjectId: null }
