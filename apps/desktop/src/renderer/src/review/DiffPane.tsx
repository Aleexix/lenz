import { DiffEditor } from '@monaco-editor/react'
import { MessageSquarePlus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { FileVersions, ReviewComment } from '../../../shared/review'
import { TERMINAL_FONT_FAMILY } from '../terminal/terminal-theme'
import { languageFor, monaco } from './monaco-setup'

const MAX_EXCERPT_LINES = 12

/** First and last line a selection covers; a selection ending at column 1 doesn't include that line. */
function selectedLines(selection: monaco.Selection | null): [number, number] | null {
  if (!selection) return null
  const { startLineNumber, endLineNumber, endColumn } = selection
  const end = endColumn === 1 && endLineNumber > startLineNumber ? endLineNumber - 1 : endLineNumber
  return [startLineNumber, end]
}

interface Draft {
  startLine: number
  endLine: number
  excerpt: string
}

interface Props {
  path: string
  versions: FileVersions
  comments: ReviewComment[]
  onComment: (comment: Omit<ReviewComment, 'id' | 'path'>) => void
}

/**
 * Side-by-side diff of one file. Click a line number on the right (or use
 * "Comentar estas líneas" in the context menu) to leave a note on it.
 */
export function DiffPane({ path, versions, comments, onComment }: Props) {
  const modifiedRef = useRef<monaco.editor.ICodeEditor | null>(null)
  const decorationsRef = useRef<monaco.editor.IEditorDecorationsCollection | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [text, setText] = useState('')
  const textRef = useRef<HTMLTextAreaElement>(null)

  function startDraft(startLine: number, endLine: number) {
    const model = modifiedRef.current?.getModel()
    if (!model) return
    const last = Math.min(endLine, startLine + MAX_EXCERPT_LINES - 1)
    const excerpt = model.getValueInRange({
      startLineNumber: startLine,
      startColumn: 1,
      endLineNumber: last,
      endColumn: model.getLineMaxColumn(last),
    })
    setDraft({ startLine, endLine, excerpt: endLine > last ? `${excerpt}\n…` : excerpt })
    setText('')
  }

  useEffect(() => {
    if (draft) textRef.current?.focus()
  }, [draft])

  // Comment markers in the gutter of the modified side.
  useEffect(() => {
    decorationsRef.current?.set(
      comments.map((comment) => ({
        range: new monaco.Range(comment.startLine, 1, comment.endLine, 1),
        options: {
          isWholeLine: true,
          className: 'lenz-commented-line',
          glyphMarginClassName: 'lenz-comment-glyph',
          glyphMarginHoverMessage: { value: comment.text },
        },
      })),
    )
  }, [comments])

  function submit() {
    if (!draft || !text.trim()) return
    onComment({ ...draft, text: text.trim() })
    setDraft(null)
  }

  if (versions.skipped) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-ice/50">
        {versions.skipped === 'binary'
          ? 'Archivo binario: no se muestra el diff.'
          : 'Archivo demasiado grande para mostrar el diff.'}
      </div>
    )
  }

  return (
    <div className="relative flex h-full flex-col">
      <div className="min-h-0 flex-1">
        <DiffEditor
          original={versions.original}
          modified={versions.modified}
          language={languageFor(path)}
          theme="lenz"
          options={{
            readOnly: true,
            originalEditable: false,
            renderSideBySide: true,
            automaticLayout: true,
            glyphMargin: true,
            minimap: { enabled: false },
            renderOverviewRuler: false,
            scrollBeyondLastLine: false,
            fontFamily: TERMINAL_FONT_FAMILY,
            fontSize: 12.5,
            lineHeight: 19,
            hideUnchangedRegions: { enabled: true, contextLineCount: 4, minimumLineCount: 6 },
          }}
          onMount={(editor) => {
            const modified = editor.getModifiedEditor()
            modifiedRef.current = modified
            decorationsRef.current = modified.createDecorationsCollection()
            modified.onMouseDown((event) => {
              const type = event.target.type
              const line = event.target.position?.lineNumber
              if (
                !line ||
                (type !== monaco.editor.MouseTargetType.GUTTER_LINE_NUMBERS &&
                  type !== monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN)
              ) {
                return
              }
              // Clicking a line number selects that line (Shift+click extends it); comment on what is selected.
              const lines = selectedLines(modified.getSelection())
              if (lines && line >= lines[0] && line <= lines[1]) startDraft(...lines)
              else startDraft(line, line)
            })
            modified.addAction({
              id: 'lenz.comment',
              label: 'Comentar estas líneas',
              contextMenuGroupId: 'navigation',
              contextMenuOrder: 0,
              run: (target) => {
                const lines = selectedLines(target.getSelection())
                if (lines) startDraft(...lines)
              },
            })
          }}
        />
      </div>

      {draft ? (
        <div className="border-t border-electric-600/40 bg-navy-900 p-3">
          <p className="mb-1.5 flex items-center gap-1.5 text-xs text-ice/60">
            <MessageSquarePlus size={13} className="text-electric-400" />
            Comentario en {path}:{draft.startLine}
            {draft.endLine !== draft.startLine ? `-${draft.endLine}` : ''}
          </p>
          <pre className="mb-2 max-h-24 overflow-auto rounded bg-navy-950 px-2 py-1 font-mono text-[11px] text-ice/60">
            {draft.excerpt}
          </pre>
          <textarea
            ref={textRef}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) submit()
              if (event.key === 'Escape') setDraft(null)
            }}
            placeholder="Qué debería cambiar el agente aquí…  (Ctrl+Enter para agregar)"
            className="min-h-16 w-full resize-y rounded-md border border-navy-700 bg-navy-950 px-3 py-2 text-sm text-ice outline-none placeholder:text-ice/30 focus:border-electric-600"
          />
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="rounded-md px-3 py-1 text-sm text-ice/70 hover:bg-navy-800"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={!text.trim()}
              onClick={submit}
              className="rounded-md bg-electric-600 px-3 py-1 text-sm font-medium text-white hover:bg-electric-400 disabled:opacity-50"
            >
              Agregar comentario
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
