import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type AgentStatus, daemonEndpoint, type Events, hookUrl, LenzClient } from '@lenz/protocol'
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

/**
 * Kills a terminal and waits until it is gone. node-pty on Windows can crash
 * the process if it exits while a PTY is still shutting down.
 */
async function killAndWait(client: LenzClient, id: string): Promise<void> {
  const exited = new Promise<void>((resolve) =>
    client.on('event', (name, payload) => {
      if (name === 'terminal.exit' && (payload as Events['terminal.exit']).id === id) resolve()
    }),
  )
  await client.request('terminal.kill', { id })
  await exited
  // Give ConPTY's teardown threads a moment before the next spawn or exit.
  await new Promise((resolve) => setTimeout(resolve, 100))
}

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

  it('turns Claude Code hook calls into agent status', async () => {
    const client = await LenzClient.connect(endpoint)
    const { hookPort } = await client.request('daemon.hello', { client: 'test' })
    const statuses: AgentStatus[] = []
    client.on('event', (name, payload) => {
      if (name === 'agent.status') statuses.push((payload as Events['agent.status']).status)
    })

    const token = 'tok_hooks_test_1234'
    const info = await client.request('terminal.create', {
      cwd: home,
      cols: 80,
      rows: 24,
      argv: ECHO_PROGRAM,
      agent: { name: 'Claude 1', profileId: 'claude' },
      statusToken: token,
    })
    const post = (body: object) =>
      fetch(hookUrl(hookPort, token), { method: 'POST', body: JSON.stringify(body) }).then((r) => r.status)

    expect(await post({ hook_event_name: 'UserPromptSubmit', session_id: 'sess-1' })).toBe(200)
    await waitFor(() => statuses.at(-1)?.state === 'working')

    await post({
      hook_event_name: 'PermissionRequest',
      tool_name: 'Bash',
      tool_input: { command: 'rm -rf x' },
    })
    await waitFor(() => statuses.at(-1)?.state === 'blocked')
    expect(statuses.at(-1)).toMatchObject({
      kind: 'permission',
      message: 'Aprobar Bash: rm -rf x',
      source: 'hook',
    })

    await post({ hook_event_name: 'Stop', last_assistant_message: 'Listo.\nDetalles…' })
    await waitFor(() => statuses.at(-1)?.state === 'done')
    expect(statuses.at(-1)?.message).toBe('Listo.')

    const listed = (await client.request('terminal.list', {})).find((t) => t.id === info.id)
    expect(listed?.agent).toEqual({ name: 'Claude 1', profileId: 'claude', sessionId: 'sess-1' })
    expect(listed?.status?.state).toBe('done')

    // Unknown tokens are ignored.
    expect(await fetch(hookUrl(hookPort, 'tok_unknown_0000'), { method: 'POST', body: '{}' })).toHaveProperty(
      'status',
      200,
    )
    await killAndWait(client, info.id)
    client.close()
  }, 20_000)

  const msg = Buffer.from('Compilando').toString('base64')
  const REPORT = `process.stdout.write('\\x1b]7501;state=working:msg=${msg}\\x1b\\\\')`

  async function firstStatus(program: string[]): Promise<AgentStatus> {
    const client = await LenzClient.connect(endpoint)
    let status: AgentStatus | undefined
    client.on('event', (name, payload) => {
      if (name === 'agent.status') status ??= (payload as Events['agent.status']).status
    })
    const info = await client.request('terminal.create', { cwd: home, cols: 80, rows: 24, argv: program })
    try {
      await waitFor(() => status !== undefined)
    } finally {
      await killAndWait(client, info.id)
      client.close()
    }
    return status as AgentStatus
  }

  it('reads OSC 7501 status reports from program output', async () => {
    const status = await firstStatus([process.execPath, '-e', `${REPORT};setTimeout(()=>{},5000)`])
    expect(status).toMatchObject({ state: 'working', message: 'Compilando', source: 'osc' })
  }, 20_000)

  // ConPTY turns terminal input into key events and drops the OSC reply, so
  // on Windows programs never hear back; hooks carry status there.
  it.skipIf(process.platform === 'win32')(
    'answers the OSC 7501 probe',
    async () => {
      const program = [
        process.execPath,
        '-e',
        [
          'process.stdin.setRawMode(true)',
          "process.stdout.write('\\x1b]7501;?\\x1b\\\\')",
          `process.stdin.on('data',d=>{if(String(d).includes('7501;?:states='))${REPORT}})`,
        ].join(';'),
      ]
      expect(await firstStatus(program)).toMatchObject({ state: 'working', source: 'osc' })
    },
    20_000,
  )
})
