import type { Project, Space } from '../../../shared/workspace'
import { useWorkspace } from '../workspace/workspace-store'
import { useTaskSummaries } from './task-summaries'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

/**
 * Asks how to delete a task, closes its terminals and removes its worktree.
 * The branch is kept unless the person chooses otherwise, so committed work
 * stays reachable.
 */
export async function deleteTask(project: Project, space: Space): Promise<void> {
  if (space.kind !== 'task' || !space.branch) return
  const summary = await window.lenz.git.summary(space.path, space.baseBranch ?? 'HEAD').catch(() => null)

  const warnings: string[] = []
  if (summary?.changed) {
    warnings.push(
      `⚠ ${plural(summary.changed, 'archivo con cambios sin commit se perderá', 'archivos con cambios sin commit se perderán')}.`,
    )
  }
  if (summary?.ahead) {
    warnings.push(
      `La rama tiene ${plural(summary.ahead, 'commit', 'commits')} que no están en ${space.baseBranch}.`,
    )
  }
  const choice = await window.lenz.dialog.choose(
    `¿Borrar la tarea "${space.name}"?`,
    [
      'Se cierran sus terminales y agentes, y se borra la carpeta del worktree.',
      ...warnings,
      `Rama: ${space.branch}`,
    ].join('\n\n'),
    ['Borrar y conservar la rama', 'Borrar también la rama'],
  )
  if (choice < 0) return

  useWorkspace.getState().removeSpace(space.id)
  const request = {
    repoPath: project.path,
    path: space.path,
    branch: space.branch,
    deleteBranch: choice === 1,
    force: true,
  }
  // Shells that were just killed can hold the folder open for a moment (Windows).
  let lastError: unknown
  for (let attempt = 0; attempt < 5; attempt++) {
    await sleep(attempt === 0 ? 400 : 1000)
    try {
      await window.lenz.git.removeTask(request)
      void useTaskSummaries.getState().refresh()
      return
    } catch (error) {
      lastError = error
    }
  }
  await window.lenz.dialog.choose(
    'No se pudo borrar el worktree',
    `${lastError instanceof Error ? lastError.message : String(lastError)}\n\nCarpeta: ${space.path}\nPuedes borrarla a mano; la tarea ya no aparece en Lenz.`,
    ['Entendido'],
  )
}
