export type ShortcutAction =
  | 'newTab'
  | 'newAgent'
  | 'newTask'
  | 'openReview'
  | 'closePane'
  | 'splitRight'
  | 'splitDown'
  | 'nextTab'
  | 'prevTab'
  | 'openSettings'

const isMac = navigator.userAgent.includes('Mac')

/**
 * App shortcuts. macOS uses Cmd; Windows uses Ctrl+Shift so plain Ctrl keys
 * keep reaching the shell (Ctrl+C, Ctrl+D, Ctrl+W in readline…).
 */
export function matchShortcut(event: KeyboardEvent): ShortcutAction | null {
  if (event.type !== 'keydown') return null
  if (event.ctrlKey && event.code === 'Tab') return event.shiftKey ? 'prevTab' : 'nextTab'
  // Ctrl+, / ⌘, opens settings, as in most desktop apps.
  if (event.code === 'Comma' && !event.shiftKey && !event.altKey && (isMac ? event.metaKey : event.ctrlKey)) {
    return 'openSettings'
  }

  if (isMac) {
    if (!event.metaKey || event.ctrlKey || event.altKey) return null
    switch (event.code) {
      case 'KeyT':
        return event.shiftKey ? null : 'newTab'
      case 'KeyA':
        return event.shiftKey ? 'newAgent' : null
      case 'KeyN':
        return event.shiftKey ? 'newTask' : null
      case 'KeyG':
        return event.shiftKey ? 'openReview' : null
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
    case 'KeyA':
      return 'newAgent'
    case 'KeyN':
      return 'newTask'
    case 'KeyG':
      return 'openReview'
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
  ? {
      newTab: '⌘T',
      newAgent: '⇧⌘A',
      newTask: '⇧⌘N',
      openReview: '⇧⌘G',
      closePane: '⌘W',
      splitRight: '⌘D',
      splitDown: '⇧⌘D',
      nextTab: '⌃⇥',
      prevTab: '⌃⇧⇥',
      openSettings: '⌘,',
    }
  : {
      newTab: 'Ctrl+Shift+T',
      newAgent: 'Ctrl+Shift+A',
      newTask: 'Ctrl+Shift+N',
      openReview: 'Ctrl+Shift+G',
      closePane: 'Ctrl+Shift+W',
      splitRight: 'Ctrl+Shift+D',
      splitDown: 'Ctrl+Shift+E',
      nextTab: 'Ctrl+Tab',
      prevTab: 'Ctrl+Shift+Tab',
      openSettings: 'Ctrl+,',
    }
