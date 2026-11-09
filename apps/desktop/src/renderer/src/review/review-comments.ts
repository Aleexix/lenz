import { create } from 'zustand'
import type { ReviewComment } from '../../../shared/review'
import { newId } from '../workspace/pane-tree'

interface ReviewCommentsState {
  /** space id → comments waiting to be sent to an agent */
  bySpace: Record<string, ReviewComment[]>
  add(spaceId: string, comment: Omit<ReviewComment, 'id'>): void
  remove(spaceId: string, id: string): void
  clear(spaceId: string): void
}

export const useReviewComments = create<ReviewCommentsState>()((set) => ({
  bySpace: {},
  add: (spaceId, comment) =>
    set(({ bySpace }) => ({
      bySpace: { ...bySpace, [spaceId]: [...(bySpace[spaceId] ?? []), { ...comment, id: newId('note') }] },
    })),
  remove: (spaceId, id) =>
    set(({ bySpace }) => ({
      bySpace: { ...bySpace, [spaceId]: (bySpace[spaceId] ?? []).filter((comment) => comment.id !== id) },
    })),
  clear: (spaceId) => set(({ bySpace }) => ({ bySpace: { ...bySpace, [spaceId]: [] } })),
}))

function lineRange(comment: ReviewComment): string {
  return comment.startLine === comment.endLine
    ? `${comment.startLine}`
    : `${comment.startLine}-${comment.endLine}`
}

/** One message with every comment, quoting the lines each one is about. */
export function reviewMessage(comments: ReviewComment[]): string {
  const items = comments.map((comment, index) => {
    const quoted = comment.excerpt
      .split('\n')
      .map((line) => `   > ${line}`)
      .join('\n')
    return `${index + 1}. ${comment.path}:${lineRange(comment)}\n${quoted}\n   ${comment.text.trim().replace(/\n/g, '\n   ')}`
  })
  return [
    'Revisé tus cambios y tengo estos comentarios:',
    '',
    ...items.flatMap((item) => [item, '']),
    'Aplícalos y avísame cuando termines.',
  ].join('\n')
}

/**
 * Types a message into an agent's terminal as one paste, then submits it.
 * Bracketed paste keeps multi-line text as a single prompt in Claude Code.
 */
export async function sendToTerminal(terminalId: string, message: string): Promise<void> {
  const { daemon } = window.lenz
  await daemon.request('terminal.write', { id: terminalId, data: `\x1b[200~${message}\x1b[201~` })
  await new Promise((resolve) => setTimeout(resolve, 200))
  await daemon.request('terminal.write', { id: terminalId, data: '\r' })
}
