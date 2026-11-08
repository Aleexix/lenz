import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { daemonEndpoint, type Events, LenzClient } from '@lenz/protocol'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { LenzDaemon } from './server'

// A tiny interactive program: prints "ready", then echoes each input line back.
const ECHO_PROGRAM = [
  process.execPath,
  '-e',
  "process.stdout.write('ready\\r\\n');process.stdin.on('data',d=>process.stdout.write('got:'+String(d).trim()+'\\r\\n'))",
]

const home = mkdtempSync(join(tmpdir(), 'lenzd-test-'))
const endpoint = daemonEndpoint(home)
let daemon: LenzDaemon

beforeAll(async () => {
  daemon = new LenzDaemon({ endpoint, buildId: 'test', log: () => {} })
  await daemon.listen()
})

afterAll(() => daemon.close())

function collect(client: LenzClient, id: string) {
  let text = ''
  let lastSeq = 0
  client.on('event', (name, payload) => {
    if (name !== 'terminal.data') return
    const data = payload as Events['terminal.data']
    if (data.id !== id || data.seq <= lastSeq) return
    lastSeq = data.seq
    text += data.data
  })
  return {
    text: () => text,
    start(snapshot: string, seq: number) {
      text = snapshot
      lastSeq = seq
    },
  }
}

async function waitFor(check: () => boolean, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!check()) {
    if (Date.now() > deadline) throw new Error('timed out')
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}

describe('lenzd', () => {
  it('keeps a terminal alive across clients and replays its screen', async () => {
    const first = await LenzClient.connect(endpoint)
    expect((await first.request('daemon.hello', { client: 'test' })).buildId).toBe('test')

    const info = await first.request('terminal.create', { cwd: home, cols: 80, rows: 24, argv: ECHO_PROGRAM })
    const firstView = collect(first, info.id)
    const attached = await first.request('terminal.attach', { id: info.id })
    firstView.start(attached.snapshot, attached.seq)
    await waitFor(() => firstView.text().includes('ready'))

    await first.request('terminal.write', { id: info.id, data: 'hello\r' })
    await waitFor(() => firstView.text().includes('got:hello'))
    first.close()

    // A new client (the app reopened) sees what happened before it connected.
    const second = await LenzClient.connect(endpoint)
    expect((await second.request('terminal.list', {})).map((t) => t.id)).toContain(info.id)
    const secondView = collect(second, info.id)
    const reattached = await second.request('terminal.attach', { id: info.id })
    secondView.start(reattached.snapshot, reattached.seq)
    await waitFor(() => secondView.text().includes('got:hello'))

    await second.request('terminal.write', { id: info.id, data: 'again\r' })
    await waitFor(() => secondView.text().includes('got:again'))

    const exited = new Promise<Events['terminal.exit']>((resolve) =>
      second.on('event', (name, payload) => {
        if (name === 'terminal.exit') resolve(payload as Events['terminal.exit'])
      }),
    )
    await second.request('terminal.kill', { id: info.id })
    expect((await exited).id).toBe(info.id)
    expect(await second.request('terminal.list', {})).toEqual([])
    second.close()
  }, 20_000)

  it('reports unknown terminals as not_found', async () => {
    const client = await LenzClient.connect(endpoint)
    await expect(client.request('terminal.attach', { id: 'nope' })).rejects.toMatchObject({
      code: 'not_found',
    })
    client.close()
  })
})
