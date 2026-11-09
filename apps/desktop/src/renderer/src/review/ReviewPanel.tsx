import { ExternalLink, GitCommitHorizontal, GitPullRequest, Send, Sparkles, Trash2 } from 'lucide-react'
import { type ReactNode, useEffect, useMemo, useState } from 'react'
import type { Space } from '../../../shared/workspace'
import { agentPanes, useWorkspace } from '../workspace/workspace-store'
import { reviewMessage, sendToTerminal, useReviewComments } from './review-comments'

function errorText(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : String(cause)
  if (/nothing to commit|nada para hacer commit/i.test(message)) return 'No hay cambios sin commit.'
  return message
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b border-navy-800 p-3">
      <h3 className="mb-2 text-[11px] font-medium tracking-wider text-ice/50 uppercase">{title}</h3>
      {children}
    </section>
  )
}

const smallButton =
  'flex items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium disabled:opacity-50'

interface Props {
  space: Space
  baseRef: string | null
  onSelectFile: (path: string) => void
  onCommitted: () => void
}

export function ReviewPanel({ space, baseRef, onSelectFile, onCommitted }: Props) {
  const comments = useReviewComments((state) => state.bySpace[space.id]) ?? []
  const { remove, clear } = useReviewComments.getState()
  const workspace = useWorkspace((state) => state.workspace)
  const agents = useMemo(
    () => agentPanes(workspace).filter((ref) => ref.space.id === space.id && ref.pane.terminalId),
    [workspace, space.id],
  )
  const [agentPaneId, setAgentPaneId] = useState('')
  const [sending, setSending] = useState(false)

  const [commitMessage, setCommitMessage] = useState('')
  const [commitBusy, setCommitBusy] = useState<'draft' | 'commit' | null>(null)
  const [commitNote, setCommitNote] = useState<{ ok: boolean; text: string } | null>(null)

  const [pr, setPr] = useState<{ title: string; body: string } | null>(null)
  const [prBusy, setPrBusy] = useState<'draft' | 'create' | null>(null)
  const [prNote, setPrNote] = useState<{ ok: boolean; text: string; url?: string } | null>(null)

  useEffect(() => {
    if (!agents.some((ref) => ref.pane.id === agentPaneId)) setAgentPaneId(agents[0]?.pane.id ?? '')
  }, [agents, agentPaneId])

  const target = agents.find((ref) => ref.pane.id === agentPaneId)

  async function send() {
    if (!target?.pane.terminalId || comments.length === 0) return
    setSending(true)
    try {
      await sendToTerminal(target.pane.terminalId, reviewMessage(comments))
      clear(space.id)
      useWorkspace.getState().revealPane(target.pane.id)
    } finally {
      setSending(false)
    }
  }

  async function draftCommit() {
    if (!baseRef) return
    setCommitBusy('draft')
    setCommitNote(null)
    try {
      // Measured from HEAD: the commit holds what isn't committed yet.
      setCommitMessage(await window.lenz.review.draft(space.path, 'HEAD', 'commit'))
    } catch (cause) {
      setCommitNote({ ok: false, text: errorText(cause) })
    } finally {
      setCommitBusy(null)
    }
  }

  async function commit() {
    setCommitBusy('commit')
    setCommitNote(null)
    try {
      const hash = await window.lenz.review.commit(space.path, commitMessage)
      setCommitMessage('')
      setCommitNote({ ok: true, text: `Commit ${hash} creado.` })
      onCommitted()
    } catch (cause) {
      setCommitNote({ ok: false, text: errorText(cause) })
    } finally {
      setCommitBusy(null)
    }
  }

  async function draftPr() {
    if (!baseRef) return
    setPrBusy('draft')
    setPrNote(null)
    try {
      const text = await window.lenz.review.draft(space.path, baseRef, 'pr')
      const [title = '', ...rest] = text.split('\n')
      setPr({ title: title.replace(/^#+\s*/, '').trim(), body: rest.join('\n').trim() })
    } catch (cause) {
      setPrNote({ ok: false, text: errorText(cause) })
    } finally {
      setPrBusy(null)
    }
  }

  async function createPr() {
    if (!pr || !space.branch || !space.baseBranch) return
    setPrBusy('create')
    setPrNote(null)
    try {
      const result = await window.lenz.review.pullRequest({
        path: space.path,
        branch: space.branch,
        baseBranch: space.baseBranch,
        title: pr.title,
        body: pr.body,
      })
      if (result.kind === 'created') {
        setPrNote({ ok: true, text: 'Pull request creado.', url: result.url })
        setPr(null)
      } else {
        setPrNote({ ok: false, text: result.reason })
      }
    } catch (cause) {
      setPrNote({ ok: false, text: errorText(cause) })
    } finally {
      setPrBusy(null)
    }
  }

  const inputClass =
    'w-full rounded-md border border-navy-700 bg-navy-950 px-2.5 py-1.5 text-[13px] text-ice outline-none placeholder:text-ice/30 focus:border-electric-600'

  return (
    <aside className="flex w-80 shrink-0 flex-col overflow-y-auto border-l border-navy-800 bg-navy-900/40">
      <Section title={`Comentarios (${comments.length})`}>
        {comments.length === 0 ? (
          <p className="text-[13px] text-ice/45">
            Haz clic en un número de línea del lado derecho del diff para comentar.
          </p>
        ) : (
          <ul className="mb-3 space-y-1.5">
            {comments.map((comment) => (
              <li key={comment.id} className="group rounded-md bg-navy-950/70 px-2.5 py-2 text-[13px]">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onSelectFile(comment.path)}
                    className="min-w-0 flex-1 truncate text-left font-mono text-[11px] text-electric-400 hover:underline"
                  >
                    {comment.path}:{comment.startLine}
                    {comment.endLine !== comment.startLine ? `-${comment.endLine}` : ''}
                  </button>
                  <button
                    type="button"
                    title="Quitar comentario"
                    onClick={() => remove(space.id, comment.id)}
                    className="rounded p-0.5 text-ice/40 opacity-0 group-hover:opacity-100 hover:text-red-300"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-ice/85">{comment.text}</p>
              </li>
            ))}
          </ul>
        )}
        {agents.length > 1 ? (
          <select
            className={`${inputClass} mb-2`}
            value={agentPaneId}
            onChange={(event) => setAgentPaneId(event.target.value)}
          >
            {agents.map((ref) => (
              <option key={ref.pane.id} value={ref.pane.id}>
                {ref.pane.agent.name}
              </option>
            ))}
          </select>
        ) : null}
        <button
          type="button"
          disabled={!target || comments.length === 0 || sending}
          onClick={() => void send()}
          title={target ? undefined : 'No hay un agente corriendo en este espacio'}
          className={`${smallButton} w-full bg-electric-600 text-white hover:bg-electric-400`}
        >
          <Send size={14} />
          {target ? `Enviar a ${target.pane.agent.name}` : 'Sin agente en este espacio'}
        </button>
      </Section>

      <Section title="Commit">
        <textarea
          value={commitMessage}
          onChange={(event) => setCommitMessage(event.target.value)}
          placeholder="Mensaje del commit"
          className={`${inputClass} min-h-20 resize-y font-mono text-[12px]`}
        />
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            disabled={commitBusy !== null}
            onClick={() => void draftCommit()}
            title="Claude redacta el mensaje a partir de los cambios sin commit"
            className={`${smallButton} flex-1 text-ice/80 ring-1 ring-navy-700 hover:bg-navy-800`}
          >
            <Sparkles size={14} />
            {commitBusy === 'draft' ? 'Redactando…' : 'Redactar'}
          </button>
          <button
            type="button"
            disabled={commitBusy !== null || !commitMessage.trim()}
            onClick={() => void commit()}
            className={`${smallButton} flex-1 bg-electric-600 text-white hover:bg-electric-400`}
          >
            <GitCommitHorizontal size={14} />
            {commitBusy === 'commit' ? 'Guardando…' : 'Commit'}
          </button>
        </div>
        {commitNote ? (
          <p className={`mt-2 text-xs ${commitNote.ok ? 'text-emerald-300' : 'text-red-300'}`}>
            {commitNote.text}
          </p>
        ) : null}
      </Section>

      {space.kind === 'task' ? (
        <Section title="Pull request">
          {pr ? (
            <div className="space-y-2">
              <input
                className={inputClass}
                value={pr.title}
                onChange={(event) => setPr({ ...pr, title: event.target.value })}
                placeholder="Título"
              />
              <textarea
                className={`${inputClass} min-h-28 resize-y`}
                value={pr.body}
                onChange={(event) => setPr({ ...pr, body: event.target.value })}
                placeholder="Descripción"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPr(null)}
                  className={`${smallButton} flex-1 text-ice/70 hover:bg-navy-800`}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={prBusy !== null || !pr.title.trim()}
                  onClick={() => void createPr()}
                  className={`${smallButton} flex-1 bg-electric-600 text-white hover:bg-electric-400`}
                >
                  <GitPullRequest size={14} />
                  {prBusy === 'create' ? 'Publicando…' : 'Crear PR'}
                </button>
              </div>
              <p className="text-[11px] text-ice/40">
                Sube {space.branch} a origin y abre el PR contra {space.baseBranch} con GitHub CLI.
              </p>
            </div>
          ) : (
            <button
              type="button"
              disabled={prBusy !== null || !baseRef}
              onClick={() => void draftPr()}
              className={`${smallButton} w-full text-ice/80 ring-1 ring-navy-700 hover:bg-navy-800`}
            >
              <Sparkles size={14} />
              {prBusy === 'draft' ? 'Redactando…' : 'Preparar pull request'}
            </button>
          )}
          {prNote ? (
            <div className={`mt-2 text-xs ${prNote.ok ? 'text-emerald-300' : 'text-amber-200'}`}>
              <p>{prNote.text}</p>
              {prNote.url ? (
                <button
                  type="button"
                  onClick={() => window.lenz.openExternal(prNote.url as string)}
                  className="mt-1 flex items-center gap-1 text-electric-400 hover:underline"
                >
                  <ExternalLink size={12} />
                  {prNote.url}
                </button>
              ) : null}
            </div>
          ) : null}
        </Section>
      ) : null}
    </aside>
  )
}
