import { contextBridge, ipcRenderer } from 'electron'
import type { AppInfo } from '../shared/app-info'

const lenz = {
  getAppInfo: (): Promise<AppInfo> => ipcRenderer.invoke('app:info'),
}

export type LenzApi = typeof lenz

contextBridge.exposeInMainWorld('lenz', lenz)
