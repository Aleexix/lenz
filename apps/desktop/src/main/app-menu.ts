import { app, type BrowserWindow, Menu } from 'electron'

/**
 * Terminal shortcuts (Cmd+W, Cmd+T, Ctrl+Shift+…) belong to the renderer, so
 * the menu must not claim them. macOS keeps a minimal menu for Edit roles
 * (copy/paste reach xterm through them) and Quit; Windows has no menu bar.
 */
export function installAppMenu(): void {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null)
    return
  }
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: app.name,
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' },
        ],
      },
      {
        label: 'Editar',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'selectAll' },
        ],
      },
      {
        label: 'Ventana',
        submenu: [{ role: 'minimize' }, { role: 'zoom' }, { role: 'togglefullscreen' }],
      },
    ]),
  )
}

/** DevTools on F12 / Ctrl+Shift+I in development builds only. */
export function enableDevToolsShortcut(win: BrowserWindow): void {
  if (app.isPackaged) return
  win.webContents.on('before-input-event', (_event, input) => {
    const isDevToolsKey =
      input.type === 'keyDown' &&
      (input.key === 'F12' ||
        ((input.control || input.meta) && input.shift && input.key.toLowerCase() === 'i'))
    if (isDevToolsKey) win.webContents.toggleDevTools()
  })
}
