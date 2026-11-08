import type { PaneAgent, PaneNode, SplitDirection, TerminalPane } from '../../../shared/workspace'

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`
}

export function newTerminalPane(cwd: string, agent?: PaneAgent): TerminalPane {
  return { kind: 'terminal', id: newId('pane'), terminalId: null, cwd, ...(agent ? { agent } : {}) }
}

export function terminalPanes(node: PaneNode): TerminalPane[] {
  return node.kind === 'terminal' ? [node] : node.children.flatMap(terminalPanes)
}

export function findPane(node: PaneNode, paneId: string): TerminalPane | null {
  return terminalPanes(node).find((pane) => pane.id === paneId) ?? null
}

function evenSizes(count: number): number[] {
  return Array.from({ length: count }, () => 100 / count)
}

/** Puts `added` next to `paneId`; joins the parent split if it already runs that way. */
export function splitPane(
  node: PaneNode,
  paneId: string,
  direction: SplitDirection,
  added: TerminalPane,
): PaneNode {
  if (node.kind === 'terminal') {
    if (node.id !== paneId) return node
    return { kind: 'split', id: newId('split'), direction, children: [node, added], sizes: [50, 50] }
  }
  const index = node.children.findIndex((child) => child.kind === 'terminal' && child.id === paneId)
  if (index >= 0 && node.direction === direction) {
    const children = [...node.children.slice(0, index + 1), added, ...node.children.slice(index + 1)]
    return { ...node, children, sizes: evenSizes(children.length) }
  }
  return { ...node, children: node.children.map((child) => splitPane(child, paneId, direction, added)) }
}

/** Removes a pane; a split left with one child collapses into it. Null when nothing is left. */
export function removePane(node: PaneNode, paneId: string): PaneNode | null {
  if (node.kind === 'terminal') return node.id === paneId ? null : node
  const children = node.children
    .map((child) => removePane(child, paneId))
    .filter((child): child is PaneNode => child !== null)
  if (children.length === node.children.length) {
    return { ...node, children }
  }
  if (children.length === 0) return null
  if (children.length === 1) return children[0] ?? null
  return { ...node, children, sizes: evenSizes(children.length) }
}

export function updateTerminalPane(
  node: PaneNode,
  paneId: string,
  patch: Partial<Omit<TerminalPane, 'kind' | 'id'>>,
): PaneNode {
  if (node.kind === 'terminal') return node.id === paneId ? { ...node, ...patch } : node
  return { ...node, children: node.children.map((child) => updateTerminalPane(child, paneId, patch)) }
}

export function setSplitSizes(node: PaneNode, splitId: string, sizes: number[]): PaneNode {
  if (node.kind === 'terminal') return node
  if (node.id === splitId) return { ...node, sizes }
  return { ...node, children: node.children.map((child) => setSplitSizes(child, splitId, sizes)) }
}
