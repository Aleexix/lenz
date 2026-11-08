/**
 * lenzd entry point. Started detached by the Lenz app (Electron in node mode)
 * and kept alive after the window closes, so terminals keep running.
 */
import { appendFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { daemonEndpoint } from '@lenz/protocol'
import { LenzDaemon } from './server'

const home = process.env.LENZ_HOME || join(homedir(), '.lenz')
const logDir = join(home, 'logs')
mkdirSync(logDir, { recursive: true })
const logFile = join(logDir, 'lenzd.log')

function log(message: string): void {
  try {
    appendFileSync(logFile, `${new Date().toISOString()} [${process.pid}] ${message}\n`)
  } catch {
    // Logging must never take the daemon down.
  }
}

const daemon = new LenzDaemon({
  endpoint: daemonEndpoint(home),
  buildId: process.env.LENZ_BUILD_ID || 'dev',
  log,
  onIdle: () => exit('idle'),
  onShutdown: () => exit('shutdown'),
})

function exit(reason: string): void {
  log(`exiting: ${reason}`)
  daemon.close()
  setTimeout(() => process.exit(0), 200)
}

process.on('uncaughtException', (error) => log(`uncaught: ${error.stack ?? error.message}`))
process.on('unhandledRejection', (error) => log(`unhandled rejection: ${String(error)}`))
process.on('SIGTERM', () => exit('SIGTERM'))
process.on('SIGINT', () => exit('SIGINT'))

daemon.listen().catch((error: Error) => {
  log(`could not start: ${error.message}`)
  process.exit(1)
})
