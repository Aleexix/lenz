import { useEffect } from 'react'
import { create } from 'zustand'
import type { WorktreeSummary } from '../../../shared/git'
import { useWorkspace } from '../workspace/workspace-store'

const REFRESH_MS = 10_000

interface TaskSummariesState {
  /** space id → uncommitted files and commits ahead of the base branch */
  summaries: Record<string, WorktreeSummary>
  refresh(): Promise<void>
}

export const useTaskSummaries = create<TaskSummariesState>()((set) => ({
  summaries: {},
  refresh: async () => {
    const tasks = useWorkspace
      .getState()
      .workspace.projects.flatMap((project) => project.spaces)
      .filter((space) => space.kind === 'task' && space.baseBranch)
    const entries = await Promise.all(
      tasks.map(async (space) => {
        try {
          return [space.id, await window.lenz.git.summary(space.path, space.baseBranch as string)] as const
        } catch {
          return null
        }
      }),
    )
    set({ summaries: Object.fromEntries(entries.filter((entry) => entry !== null)) })
  },
}))

/** Keeps task change counts fresh: on a timer, when the window gets focus, and when tasks change. */
export function useTaskSummaryRefresh(): void {
  const taskCount = useWorkspace(
    (state) =>
      state.workspace.projects.flatMap((project) => project.spaces).filter((s) => s.kind === 'task').length,
  )
  useEffect(() => {
    if (taskCount === 0) return
    const refresh = () => void useTaskSummaries.getState().refresh()
    refresh()
    const timer = setInterval(refresh, REFRESH_MS)
    window.addEventListener('focus', refresh)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', refresh)
    }
  }, [taskCount])
}
