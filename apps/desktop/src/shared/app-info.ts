export type Platform = 'win32' | 'darwin' | 'linux'

export interface AppInfo {
  version: string
  platform: Platform
  homeDir: string
  /** Lenz's data folder: workspace, profiles, logs. */
  dataDir: string
}

export type DaemonStatus = 'connecting' | 'connected' | 'disconnected'

export type DaemonReply<T> = { ok: true; result: T } | { ok: false; code: string; message: string }
