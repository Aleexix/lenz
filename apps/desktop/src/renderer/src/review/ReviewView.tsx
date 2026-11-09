import { FileDiff, MessageSquare, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ChangedFile, ChangeSet, FileChangeStatus, FileVersions } from '../../../shared/review'
import type { Space } from '../../../shared/workspace'
import { DiffPane } from './DiffPane'
import { ReviewPanel } from './ReviewPanel'
import { useReviewComments } from './review-comments'

const REFRESH_MS = 5_000

const STATUS_STYLE: Record<FileChangeStatus, { letter: string; className: string; label: string }> = {
  added: { letter: 'A', className: 'text-emerald-300', label: 'Nuevo' },
  modified: { letter: 'M', className: 'text-amber-300', label: 'Modificado' },
  deleted: { letter: 'D', className: 'text-red-300', label: 'Borrado' },
  renamed: { letter: 'R', className: 'text-electric-400', label: 'Renombrado' },
}

function splitPath(path: string): { dir: string; name: string } {
  const slash = path.lastIndexOf('/')
  return slash < 0 ? { dir: '', name: path } : { dir: path.slice(0, slash + 1), name: path.slice(slash + 1) }
}

function sameFile(a: ChangedFile | undefined, b: ChangedFile | undefined): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/** "Cambios": what this space changed, file by file, with review comments for its agent. */
export default function ReviewView({ space }: { space: Space }) {
  const [changes, setChanges] = useState<ChangeSet | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [versions, setVersions] = useState<{ file: ChangedFile; data: FileVersions } | null>(null)
  const comments = useReviewComments((state) => state.bySpace[space.id]) ?? []
  const addComment = useReviewComments((state) => state.add)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setChanges(await window.lenz.review.changes(space.path, space.baseBranch))
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setLoading(false)
    }
  }, [space.path, space.baseBranch])

  useEffect(() => {
    void refresh()
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, REFRESH_MS)
    const onFocus = () => void refresh()
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [refresh])

  const files = changes?.files ?? []
  const current = files.find((file) => file.path === selected) ?? files[0]

  // Load the diff when the selection changes or the file changed on disk since.
  useEffect(() => {
    if (!changes || !current) {
      setVersions(null)
      return
    }
    if (versions && versions.file.path === current.path && sameFile(versions.file, current)) return
    let cancelled = false
    void window.lenz.review
      .file(space.path, changes.baseRef, current)
      .then((data) => {
        if (!cancelled) setVersions({ file: current, data })
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [changes, current, space.path, versions])

  const totals = useMemo(
    () =>
      files.reduce(
        (sum, file) => ({
          additions: sum.additions + file.additions,
          deletions: sum.deletions + file.deletions,
        }),
        { additions: 0, deletions: 0 },
      ),
    [files],
  )
  const commentCount = (path: string) => comments.filter((comment) => comment.path === path).length

  return (
    <div className="flex h-full min-h-0">
      <div className="flex w-64 shrink-0 flex-col border-r border-navy-800">
        <div className="flex items-center justify-between border-b border-navy-800 px-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-[13px] text-ice">
              {files.length} {files.length === 1 ? 'archivo' : 'archivos'}
              <span className="ml-2 font-mono text-[11px]">
                <span className="text-emerald-300">+{totals.additions}</span>{' '}
                <span className="text-red-300">−{totals.deletions}</span>
              </span>
            </p>
            <p className="truncate text-[11px] text-ice/45">
              desde {changes?.baseLabel ?? (space.baseBranch || 'último commit')}
            </p>
          </div>
          <button
            type="button"
            title="Actualizar"
            onClick={() => void refresh()}
            className="rounded p-1 text-ice/50 hover:bg-navy-800 hover:text-ice"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto py-1">
          {files.map((file) => {
            const style = STATUS_STYLE[file.status]
            const { dir, name } = splitPath(file.path)
            const active = file.path === current?.path
            const notes = commentCount(file.path)
            return (
              <li key={file.path}>
                <button
                  type="button"
                  onClick={() => setSelected(file.path)}
                  title={`${style.label}: ${file.oldPath ? `${file.oldPath} → ` : ''}${file.path}`}
                  className={`flex w-full items-center gap-2 px-3 py-1 text-left text-[13px] ${
                    active ? 'bg-navy-800 text-ice' : 'text-ice/75 hover:bg-navy-800/50'
                  }`}
                >
                  <span className={`w-3 shrink-0 font-mono text-[11px] font-semibold ${style.className}`}>
                    {style.letter}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {name}
                    {dir ? <span className="ml-1.5 text-[11px] text-ice/35">{dir}</span> : null}
                  </span>
                  {notes > 0 ? (
                    <span className="flex items-center gap-0.5 text-[11px] text-electric-400">
                      <MessageSquare size={11} />
                      {notes}
                    </span>
                  ) : null}
                  {!file.binary ? (
                    <span className="shrink-0 font-mono text-[10px] text-ice/40">
                      +{file.additions} −{file.deletions}
                    </span>
                  ) : null}
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      <div className="min-w-0 flex-1">
        {error ? (
          <div className="flex h-full items-center justify-center p-8 text-center text-sm text-amber-200">
            {/not a git repository/i.test(error) ? 'Esta carpeta no es un repositorio git.' : error}
          </div>
        ) : !changes ? null : files.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-ice/50">
            <FileDiff size={28} />
            <p className="text-sm">
              No hay cambios {space.baseBranch ? `respecto a ${space.baseBranch}` : 'sin commit'}.
            </p>
          </div>
        ) : current && versions?.file.path === current.path ? (
          <DiffPane
            key={current.path}
            path={current.path}
            versions={versions.data}
            comments={comments.filter((comment) => comment.path === current.path)}
            onComment={(comment) => addComment(space.id, { ...comment, path: current.path })}
          />
        ) : null}
      </div>

      <ReviewPanel
        space={space}
        baseRef={changes?.baseRef ?? null}
        onSelectFile={setSelected}
        onCommitted={() => void refresh()}
      />
    </div>
  )
}
