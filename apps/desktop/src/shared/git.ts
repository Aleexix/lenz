export interface RepoInfo {
  /** Top folder of the repository (the main checkout). */
  root: string
  /** Checked-out branch; null when HEAD is detached or there are no commits yet. */
  currentBranch: string | null
  branches: string[]
  hasCommits: boolean
}

export interface CreateTaskRequest {
  repoPath: string
  name: string
  baseBranch: string
}

export interface CreatedWorktree {
  path: string
  branch: string
}

export interface WorktreeSummary {
  /** Files with uncommitted changes (including untracked). */
  changed: number
  /** Commits on the task branch that the base branch doesn't have. */
  ahead: number
}

export interface RemoveTaskRequest {
  repoPath: string
  path: string
  branch: string
  deleteBranch: boolean
  /** Remove even with uncommitted changes. */
  force: boolean
}
