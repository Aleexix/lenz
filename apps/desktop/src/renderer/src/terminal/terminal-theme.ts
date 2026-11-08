import type { ITheme } from '@xterm/xterm'

/** Lenz navy theme; ANSI colors tuned to read well on Navy 950. */
export const LENZ_TERMINAL_THEME: ITheme = {
  background: '#070E2B',
  foreground: '#E3EAF8',
  cursor: '#5B9BFF',
  cursorAccent: '#070E2B',
  selectionBackground: '#2F6BF066',
  selectionInactiveBackground: '#2F6BF033',
  black: '#1A2F6E',
  red: '#F2607A',
  green: '#4FD6A3',
  yellow: '#F5C46B',
  blue: '#5B9BFF',
  magenta: '#B58CFF',
  cyan: '#4CC9E8',
  white: '#D9E2F6',
  brightBlack: '#5A6BA0',
  brightRed: '#FF8499',
  brightGreen: '#7BE8BF',
  brightYellow: '#FFD98F',
  brightBlue: '#8AB8FF',
  brightMagenta: '#CDB0FF',
  brightCyan: '#7FDDF2',
  brightWhite: '#FFFFFF',
}

export const TERMINAL_FONT_FAMILY = "'Geist Mono Variable', 'Cascadia Mono', Menlo, Consolas, monospace"
export const TERMINAL_FONT_SIZE = 13
