import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { daemonEndpoint, type EventName, type Events, LenzClient } from '@lenz/protocol'
import type { DaemonStatus } from '../shared/app-info'

const SPAWN_WAIT_MS = 8_000
const RECONNECT_DELAY_MS = 500

interface ManagerEvents {
  status: [DaemonStatus]
  event: [name: EventName, payload: Events[EventName]]
  /** A new connection replaced a lost one; attached terminals must re-attach. */
  reconnected: []
}

/**
 * Finds or starts lenzd and keeps one connection to it. lenzd is spawned
 * detached so it outlives the window; a daemon from a different build is
 * replaced.
 */
export class DaemonManager extends EventEmitter<ManagerEvents> {
  private client: LenzClient | null = null
  private connecting: Promise<LenzClient> | null = null
  private stopped = false
  private hadConnection = false
  private readonly buildId: string
  private readonly endpoint: string
  status: DaemonStatus = 'disconnected'
  /** lenzd's loopback port for agent hooks; changes when lenzd restarts. */
  hookPort = 0

  constructor(
    private readonly home: string,
    private readonly daemonScript: string,
    private readonly log: (message: string) => void,
  ) {
    super()
    this.endpoint = daemonEndpoint(home)
    this.buildId = hashBundle(daemonScript)
  }

  getClient(): Promise<LenzClient> {
    if (this.client && !this.client.isClosed) return Promise.resolve(this.client)
    this.connecting ??= this.connect().finally(() => {
      this.connecting = null
    })
    return this.connecting
  }

  /** Disconnect without stopping lenzd: terminals keep running. */
  dispose(): void {
    this.stopped = true
    this.client?.close()
  }

  private setStatus(status: DaemonStatus): void {
    this.status = status
    this.emit('status', status)
  }

  private async connect(): Promise<LenzClient> {
    this.setStatus('connecting')
    try {
      let client = await this.tryConnect()
      if (client) {
        const hello = await client.request('daemon.hello', { client: 'lenz-desktop' })
        if (hello.buildId !== this.buildId) {
          this.log(`replacing lenzd ${hello.pid} (build ${hello.buildId}, ${hello.terminals} terminals)`)
          await client.request('daemon.shutdown', {}).catch(() => undefined)
          client.close()
          client = null
          await this.waitUntilGone()
        }
      }
      if (!client) {
        this.spawnDaemon()
        client = await this.waitForDaemon()
      }
      this.hookPort = (await client.request('daemon.hello', { client: 'lenz-desktop' })).hookPort
      this.adopt(client)
      return client
    } catch (error) {
      this.setStatus('disconnected')
      throw error
    }
  }

  private adopt(client: LenzClient): void {
    const isReconnect = this.hadConnection
    this.client = client
    this.hadConnection = true
    client.on('event', (name, payload) => this.emit('event', name, payload))
    client.on('close', () => {
      if (this.client === client) this.client = null
      this.setStatus('disconnected')
      if (this.stopped) return
      this.log('lost connection to lenzd; reconnecting')
      setTimeout(
        () => void this.getClient().catch((error) => this.log(`reconnect failed: ${error}`)),
        RECONNECT_DELAY_MS,
      )
    })
    this.setStatus('connected')
    if (isReconnect) this.emit('reconnected')
  }

  private async tryConnect(): Promise<LenzClient | null> {
    try {
      return await LenzClient.connect(this.endpoint, 1000)
    } catch {
      return null
    }
  }

  private spawnDaemon(): void {
    this.log(`starting lenzd (build ${this.buildId})`)
    const child = spawn(process.execPath, [this.daemonScript], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        LENZ_HOME: this.home,
        LENZ_BUILD_ID: this.buildId,
      },
    })
    child.on('error', (error) => this.log(`lenzd failed to start: ${error.message}`))
    child.unref()
  }

  private async waitForDaemon(): Promise<LenzClient> {
    const deadline = Date.now() + SPAWN_WAIT_MS
    while (Date.now() < deadline) {
      const client = await this.tryConnect()
      if (client) return client
      await sleep(100)
    }
    throw new Error(`lenzd did not start; see ${this.home}/logs/lenzd.log`)
  }

  private async waitUntilGone(): Promise<void> {
    const deadline = Date.now() + 3_000
    while (Date.now() < deadline) {
      const client = await this.tryConnect()
      if (!client) return
      client.close()
      await sleep(100)
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Identifies the daemon code: the entry file and the chunks it requires. */
function hashBundle(entry: string): string {
  const hash = createHash('sha256')
  const seen = new Set<string>()
  const visit = (file: string) => {
    if (seen.has(file)) return
    seen.add(file)
    let source: string
    try {
      source = readFileSync(file, 'utf8')
    } catch {
      return
    }
    hash.update(source)
    for (const match of source.matchAll(/require\(["'](\.{1,2}\/[^"']+)["']\)/g)) {
      const target = match[1]
      if (target) visit(resolve(dirname(file), target.endsWith('.js') ? target : `${target}.js`))
    }
  }
  visit(entry)
  return hash.digest('hex').slice(0, 16)
}
