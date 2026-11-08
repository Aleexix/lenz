import { createHash } from 'node:crypto'
import { userInfo } from 'node:os'
import { join } from 'node:path'

/**
 * Where lenzd listens. One daemon per Lenz home, so the dev build and the
 * installed app never share terminals.
 */
export function daemonEndpoint(lenzHome: string): string {
  if (process.platform === 'win32') {
    const tag = createHash('sha256').update(`${userInfo().username}:${lenzHome}`).digest('hex').slice(0, 12)
    return `\\\\.\\pipe\\lenzd-${tag}`
  }
  return join(lenzHome, 'lenzd.sock')
}
