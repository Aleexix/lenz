export type FileChangeStatus = 'added' | 'modified' | 'deleted' | 'renamed'

export interface ChangedFile {
  path: string
  /** Previous path, for renames. */
  oldPath?: string
  status: FileChangeStatus
  additions: number
  deletions: number
  binary: boolean
}

export interface ChangeSet {
  /** Commit the changes are measured from: where the task left its base branch, or HEAD. */
  baseRef: string
  /** What `baseRef` stands for, for display ("main", "último commit"). */
  baseLabel: string
  files: ChangedFile[]
}

export interface FileVersions {
  original: string
  modified: string
  /** Not shown as text: binary, or too large to diff comfortably. */
  skipped?: 'binary' | 'too-large'
}

export interface PullRequestRequest {
  path: string
  branch: string
  baseBranch: string
  title: string
  body: string
}

export type PullRequestResult = { kind: 'created'; url: string } | { kind: 'needs-gh'; reason: string }

/** A review note on lines of the modified file. */
export interface ReviewComment {
  id: string
  path: string
  startLine: number
  endLine: number
  /** The commented lines, quoted back to the agent. */
  excerpt: string
  text: string
}
