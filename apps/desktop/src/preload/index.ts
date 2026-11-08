import type { EventName, Events, MethodName, Params, Result } from '@lenz/protocol'
import { clipboard, contextBridge, ipcRenderer } from 'electron'
import type { AppInfo, DaemonReply, DaemonStatus } from '../shared/app-info'
import type { Workspace } from '../shared/workspace'

function on<A extends unknown[]>(channel: string, listener: (...args: A) => void): () => void {
  const wrapped = (_event: Electron.IpcRendererEvent, ...args: unknown[]) => listener(...(args as A))
  ipcRenderer.on(channel, wrapped)
  return () => ipcRenderer.off(channel, wrapped)
}

const lenz = {
  getAppInfo: (): Promise<AppInfo> => ipcRenderer.invoke('app:info'),

  daemon: {
    async request<M extends MethodName>(method: M, params: Params<M>): Promise<Result<M>> {
      const reply: DaemonReply<Result<M>> = await ipcRenderer.invoke('daemon:request', method, params)
      if (reply.ok) return reply.result
      // contextBridge drops custom error classes; keep the code in the message prefix.
      throw new Error(`${reply.code}: ${reply.message}`)
    },
    status: (): Promise<DaemonStatus> => ipcRenderer.invoke('daemon:status'),
    onStatus: (listener: (status: DaemonStatus) => void) => on('daemon:status', listener),
    onEvent: (listener: <E extends EventName>(name: E, payload: Events[E]) => void) =>
      on('daemon:event', listener as (name: EventName, payload: Events[EventName]) => void),
    onReconnected: (listener: () => void) => on('daemon:reconnected', listener),
  },

  workspace: {
    load: (): Promise<Workspace | null> => ipcRenderer.invoke('workspace:load'),
    save: (workspace: Workspace): Promise<void> => ipcRenderer.invoke('workspace:save', workspace),
    /** For beforeunload, where async work would be cut off. */
    saveSync: (workspace: Workspace): void => {
      ipcRenderer.sendSync('workspace:save-sync', workspace)
    },
  },

  dialog: {
    openFolder: (): Promise<string | null> => ipcRenderer.invoke('dialog:open-folder'),
    confirm: (message: string, detail: string, confirmLabel: string): Promise<boolean> =>
      ipcRenderer.invoke('dialog:confirm', message, detail, confirmLabel),
  },

  clipboard: {
    readText: (): Promise<string> => clipboard.readText(),
    writeText: (text: string): Promise<void> => clipboard.writeText(text),
  },
}

export type LenzApi = typeof lenz

contextBridge.exposeInMainWorld('lenz', lenz)
