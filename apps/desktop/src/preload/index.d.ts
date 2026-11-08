import type { LenzApi } from './index'

declare global {
  interface Window {
    lenz: LenzApi
  }
}
