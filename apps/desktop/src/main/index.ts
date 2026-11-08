import { join } from 'node:path'
import { app, BrowserWindow, ipcMain, shell } from 'electron'
import type { AppInfo, Platform } from '../shared/app-info'

const NAVY_950 = '#070E2B'
const TITLE_BAR_HEIGHT = 40

function createWindow(): void {
  const isMac = process.platform === 'darwin'
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 500,
    show: false,
    title: 'Lenz',
    backgroundColor: NAVY_950,
    // Packaged builds take the icon from the executable/bundle.
    ...(app.isPackaged ? {} : { icon: join(__dirname, '../../build/icon.png') }),
    titleBarStyle: 'hidden',
    // macOS keeps its traffic lights; Windows/Linux draw caption buttons over our custom bar.
    ...(isMac
      ? { trafficLightPosition: { x: 14, y: 13 } }
      : { titleBarOverlay: { color: NAVY_950, symbolColor: '#EEF3FD', height: TITLE_BAR_HEIGHT } }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.once('ready-to-show', () => win.show())

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })

  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (!app.isPackaged && devUrl) {
    void win.loadURL(devUrl)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

ipcMain.handle(
  'app:info',
  (): AppInfo => ({ version: app.getVersion(), platform: process.platform as Platform }),
)

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows()
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  void app.whenReady().then(() => {
    if (process.platform === 'win32') app.setAppUserModelId('dev.lenz.app')
    createWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
