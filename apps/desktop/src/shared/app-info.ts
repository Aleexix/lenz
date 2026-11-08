export type Platform = 'win32' | 'darwin' | 'linux'

export interface AppInfo {
  version: string
  platform: Platform
}
