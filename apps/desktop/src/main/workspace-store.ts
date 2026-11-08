import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { Workspace } from '../shared/workspace'

/** workspace.json in the user data folder; written atomically. */
export class WorkspaceStore {
  constructor(private readonly file: string) {}

  load(): Workspace | null {
    try {
      const data = JSON.parse(readFileSync(this.file, 'utf8')) as Workspace
      return data?.version === 1 && Array.isArray(data.projects) ? data : null
    } catch {
      return null
    }
  }

  save(workspace: Workspace): void {
    mkdirSync(dirname(this.file), { recursive: true })
    const temp = `${this.file}.tmp`
    writeFileSync(temp, JSON.stringify(workspace, null, 2))
    renameSync(temp, this.file)
  }
}
