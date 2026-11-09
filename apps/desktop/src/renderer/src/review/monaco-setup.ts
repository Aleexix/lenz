/**
 * Monaco from the app bundle (no CDN: the page's CSP blocks it), with its
 * worker and the Lenz theme. Imported only by the review view, so Monaco
 * loads the first time someone opens "Cambios".
 */
import { loader } from '@monaco-editor/react'
import EditorWorker from 'monaco-editor-esm/editor/editor.worker.js?worker'
import * as monaco from './monaco-lean'

self.MonacoEnvironment = { getWorker: () => new EditorWorker() }
loader.config({ monaco })

monaco.editor.defineTheme('lenz', {
  base: 'vs-dark',
  inherit: true,
  rules: [],
  colors: {
    'editor.background': '#070E2B',
    'editor.foreground': '#E3EAF8',
    'editorLineNumber.foreground': '#4A5A8F',
    'editorLineNumber.activeForeground': '#8AB8FF',
    'editor.lineHighlightBackground': '#0D1A45',
    'editor.selectionBackground': '#2F6BF055',
    'editorGutter.background': '#070E2B',
    'diffEditor.insertedTextBackground': '#4FD6A322',
    'diffEditor.removedTextBackground': '#F2607A22',
    'diffEditor.insertedLineBackground': '#4FD6A314',
    'diffEditor.removedLineBackground': '#F2607A14',
    'diffEditor.diagonalFill': '#1A2F6E55',
    'scrollbarSlider.background': '#1A2F6E99',
    'scrollbarSlider.hoverBackground': '#26408CCC',
  },
})

const byExtension = new Map<string, string>()
for (const language of monaco.languages.getLanguages()) {
  for (const extension of language.extensions ?? []) byExtension.set(extension.toLowerCase(), language.id)
}

/** Monaco language id for a file path, by extension; plain text when unknown. */
export function languageFor(path: string): string {
  const name = path.split('/').pop()?.toLowerCase() ?? ''
  const dot = name.lastIndexOf('.')
  return (dot >= 0 && byExtension.get(name.slice(dot))) || 'plaintext'
}

export { monaco }
