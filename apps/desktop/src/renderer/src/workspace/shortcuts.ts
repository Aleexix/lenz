export type ShortcutAction = 'newTab' | 'closePane' | 'splitRight' | 'splitDown' | 'nextTab' | 'prevTab'

const isMac = navigator.userAgent.includes('Mac')

/**
 * App shortcuts. macOS uses Cmd; Windows uses Ctrl+Shift so plain Ctrl keys
 * keep reaching the shell (Ctrl+C, Ctrl+D, Ctrl+W in readline…).
 */
export function matchShortcut(event: KeyboardEvent): ShortcutAction | null {
  if (event.type !== 'keydown') return null
  if (event.ctrlKey && event.code === 'Tab') return event.shiftKey ? 'prevTab' : 'nextTab'

  if (isMac) {
    if (!event.metaKey || event.ctrlKey || event.altKey) return null
    switch (event.code) {
      case 'KeyT':
        return event.shiftKey ? null : 'newTab'
      case 'KeyW':
        return event.shiftKey ? null : 'closePane'
      case 'KeyD':
        return event.shiftKey ? 'splitDown' : 'splitRight'
      case 'BracketRight':
        return event.shiftKey ? 'nextTab' : null
      case 'BracketLeft':
        return event.shiftKey ? 'prevTab' : null
      default:
        return null
    }
  }

  if (!event.ctrlKey || !event.shiftKey || event.altKey || event.metaKey) return null
  switch (event.code) {
    case 'KeyT':
      return 'newTab'
    case 'KeyW':
      return 'closePane'
    case 'KeyD':
      return 'splitRight'
    case 'KeyE':
      return 'splitDown'
    default:
      return null
  }
}

export type ClipboardAction = 'copy' | 'paste'

/**
 * Terminal clipboard keys on Windows/Linux (macOS uses the Edit menu's Cmd+C/V).
 * Ctrl+C copies only when text is selected; otherwise it interrupts the program.
 */
export function matchClipboard(event: KeyboardEvent, hasSelection: boolean): ClipboardAction | null {
  if (isMac || !event.ctrlKey || event.altKey || event.metaKey) return null
  if (event.code === 'KeyV') return 'paste'
  if (event.code === 'KeyC' && (event.shiftKey || hasSelection)) return 'copy'
  return null
}

export const SHORTCUT_LABELS: Record<ShortcutAction, string> = isMac
  ? { newTab: '⌘T', closePane: '⌘W', splitRight: '⌘D', splitDown: '⇧⌘D', nextTab: '⌃⇥', prevTab: '⌃⇧⇥' }
  : {
      newTab: 'Ctrl+Shift+T',
      closePane: 'Ctrl+Shift+W',
      splitRight: 'Ctrl+Shift+D',
      splitDown: 'Ctrl+Shift+E',
      nextTab: 'Ctrl+Tab',
      prevTab: 'Ctrl+Shift+Tab',
    }
