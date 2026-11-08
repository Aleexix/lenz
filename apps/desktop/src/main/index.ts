import { appendFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { type Events, LenzRpcError, type MethodName } from '@lenz/protocol'
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import type { AppInfo, DaemonReply, Platform } from '../shared/app-info'
import type { LaunchAgentRequest, ProfileInput } from '../shared/profiles'
import type { Workspace } from '../shared/workspace'
import { AgentLauncher } from './agent-launcher'
import { enableDevToolsShortcut, installAppMenu } from './app-menu'
import { DaemonManager } from './daemon-manager'
import { ProfileStore } from './profile-store'
import { WorkspaceStore } from './workspace-store'

const NAVY_950 = '#070E2B'
const TITLE_BAR_HEIGHT = 40

// Development gets its own data folder, workspace and lenzd. LENZ_USER_DATA isolates test runs.
if (process.env.LENZ_USER_DATA) app.setPath('userData', process.env.LENZ_USER_DATA)
else if (!app.isPackaged) app.setPath('userData', join(app.getPath('appData'), 'Lenz Dev'))

const home = app.getPath('userData')
mkdirSync(join(home, 'logs'), { recursive: true })

function log(message: string): void {
  try {
    appendFileSync(join(home, 'logs', 'main.log'), `${new Date().toISOString()} ${message}\n`)
  } catch {
    // ignore
  }
}

const daemon = new DaemonManager(home, join(__dirname, 'lenzd.js'), log)
const workspaceStore = new WorkspaceStore(join(home, 'workspace.json'))
const profiles = new ProfileStore(home)
const launcher = new AgentLauncher(home)

function broadcast(channel: string, ...args: unknown[]): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, ...args)
  }
}

daemon.on('status', (status) => broadcast('daemon:status', status))
daemon.on('event', (name, payload) => {
  if (name === 'terminal.exit') launcher.forget((payload as Events['terminal.exit']).id)
  broadcast('daemon:event', name, payload)
})
daemon.on('reconnected', () => broadcast('daemon:reconnected'))

/** Runs `work` and reports failures as data: errors thrown across ipcMain.handle lose their message. */
async function reply<T>(work: () => T | Promise<T>): Promise<DaemonReply<T>> {
  try {
    return { ok: true, result: await work() }
  } catch (error) {
    const code = error instanceof LenzRpcError ? error.code : 'failed'
    return { ok: false, code, message: error instanceof Error ? error.message : String(error) }
  }
}

async function launchAgent(request: LaunchAgentRequest) {
  const profile = profiles.get(request.profileId)
  if (!profile) throw new Error('Ese perfil ya no existe')
  const client = await daemon.getClient()
  const apiKey = profile.kind === 'claude-subscription' ? undefined : profiles.apiKey(profile.id)
  const { params, settingsFile } = await launcher.prepare(request, profile, apiKey, daemon.hookPort)
  try {
    const info = await client.request('terminal.create', params)
    launcher.track(info.id, settingsFile)
    log(`agent "${request.name}" started in ${info.id} with profile ${profile.id}`)
    return info
  } catch (error) {
    launcher.discard(settingsFile)
    throw error
  }
}

function registerIpc(): void {
  ipcMain.handle('profiles:list', () => reply(() => profiles.list()))
  ipcMain.handle('profiles:save', (_event, input: ProfileInput) => reply(() => profiles.save(input)))
  ipcMain.handle('profiles:delete', (_event, id: string) => reply(() => profiles.delete(id)))
  ipcMain.handle('agent:launch', (_event, request: LaunchAgentRequest) => reply(() => launchAgent(request)))

  ipcMain.handle(
    'app:info',
    (): AppInfo => ({
      version: app.getVersion(),
      platform: process.platform as Platform,
      homeDir: homedir(),
    }),
  )

  ipcMain.handle('daemon:status', () => daemon.status)

  ipcMain.on('app:focus-window', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  })

  ipcMain.handle(
    'daemon:request',
    async (_event, method: MethodName, params: unknown): Promise<DaemonReply<unknown>> => {
      try {
        const client = await daemon.getClient()
        return { ok: true, result: await client.request(method, params as never) }
      } catch (error) {
        const code = error instanceof LenzRpcError ? error.code : 'unavailable'
        return { ok: false, code, message: error instanceof Error ? error.message : String(error) }
      }
    },
  )

  ipcMain.handle('workspace:load', () => workspaceStore.load())
  ipcMain.handle('workspace:save', (_event, workspace: Workspace) => workspaceStore.save(workspace))
  ipcMain.on('workspace:save-sync', (event, workspace: Workspace) => {
    workspaceStore.save(workspace)
    event.returnValue = true
  })

  ipcMain.handle('dialog:open-folder', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const options = { title: 'Abrir proyecto', properties: ['openDirectory' as const] }
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })

  ipcMain.handle('dialog:confirm', async (event, message: string, detail: string, confirmLabel: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const options = {
      type: 'question' as const,
      message,
      detail,
      buttons: [confirmLabel, 'Cancelar'],
      defaultId: 1,
      cancelId: 1,
    }
    const result = win ? await dialog.showMessageBox(win, options) : await dialog.showMessageBox(options)
    return result.response === 0
  })
}

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
  enableDevToolsShortcut(win)

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) void shell.openExternal(url)
    return { action: 'deny' }
  })

  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (!app.isPackaged && devUrl) {
    void win.loadURL(devUrl)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

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
    installAppMenu()
    registerIpc()
    // Start lenzd early so the first terminal opens without waiting.
    daemon.getClient().catch((error) => log(`lenzd unavailable: ${error}`))
    createWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  // Closing Lenz leaves lenzd and its terminals running.
  app.on('will-quit', () => daemon.dispose())
}
