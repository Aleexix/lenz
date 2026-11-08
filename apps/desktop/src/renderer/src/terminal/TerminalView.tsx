import '@xterm/xterm/css/xterm.css'
import { FitAddon } from '@xterm/addon-fit'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { Terminal } from '@xterm/xterm'
import { useEffect, useRef } from 'react'
import type { TerminalPane } from '../../../shared/workspace'
import { useAgentStatus } from '../agents/agent-store'
import { matchClipboard, matchShortcut } from '../workspace/shortcuts'
import { agentPanes, useWorkspace } from '../workspace/workspace-store'
import { LENZ_TERMINAL_THEME, TERMINAL_FONT_FAMILY, TERMINAL_FONT_SIZE } from './terminal-theme'

interface Props {
  pane: TerminalPane
  focused: boolean
}

/**
 * One xterm.js view bound to a lenzd terminal. Re-attaching replays the
 * screen from lenzd; if the terminal is gone, a fresh shell starts in the
 * pane's folder.
 */
export function TerminalView({ pane, focused }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  // The pane's terminal id is read at attach time, not tracked as a dependency:
  // storing a new id must not tear the view down.
  const paneRef = useRef(pane)
  paneRef.current = pane
  const focusedRef = useRef(focused)
  focusedRef.current = focused

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const { daemon } = window.lenz
    const { setTerminalId, closePane } = useWorkspace.getState()

    const term = new Terminal({
      fontFamily: TERMINAL_FONT_FAMILY,
      fontSize: TERMINAL_FONT_SIZE,
      lineHeight: 1.15,
      theme: LENZ_TERMINAL_THEME,
      cursorBlink: true,
      scrollback: 10_000,
      allowProposedApi: true,
    })
    termRef.current = term
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.loadAddon(new Unicode11Addon())
    term.unicode.activeVersion = '11'
    term.loadAddon(new WebLinksAddon((_event, uri) => window.open(uri)))

    let disposed = false
    let terminalId: string | null = null
    let attached = false
    let lastSeq = 0
    const early: { seq: number; data: string }[] = []

    term.attachCustomKeyEventHandler((event) => {
      if (matchShortcut(event)) return false
      const clipboardAction = matchClipboard(event, term.hasSelection())
      if (clipboardAction === 'copy') {
        if (event.type === 'keydown') {
          void window.lenz.clipboard.writeText(term.getSelection())
          term.clearSelection()
        }
        event.preventDefault()
        return false
      }
      // Paste: let the browser fire its paste event, which xterm handles (bracketed paste included).
      if (clipboardAction === 'paste') return false
      return true
    })

    const offEvent = daemon.onEvent((name, payload) => {
      if (name === 'terminal.data') {
        const chunk = payload as { id: string; seq: number; data: string }
        if (chunk.id !== terminalId) return
        if (!attached) {
          early.push(chunk)
        } else if (chunk.seq > lastSeq) {
          lastSeq = chunk.seq
          term.write(chunk.data)
        }
      } else if (name === 'terminal.exit') {
        const exit = payload as { id: string }
        if (exit.id === terminalId) closePane(paneRef.current.id, false)
      }
    })

    const fitIfVisible = () => {
      if (container.offsetWidth > 0 && container.offsetHeight > 0) fit.fit()
    }

    async function attach(): Promise<void> {
      attached = false
      early.length = 0
      const { cols, rows } = term
      let id = paneRef.current.terminalId
      let replay: Awaited<ReturnType<typeof daemon.request<'terminal.attach'>>> | null = null

      if (id) {
        terminalId = id
        try {
          // Match sizes first so the snapshot is laid out for this view.
          await daemon.request('terminal.resize', { id, cols, rows })
          replay = await daemon.request('terminal.attach', { id })
        } catch {
          replay = null
        }
      }
      if (disposed) return
      if (!replay) {
        const { cwd, agent } = paneRef.current
        const home = agent
          ? agentPanes(useWorkspace.getState().workspace).find(({ pane }) => pane.id === paneRef.current.id)
          : undefined
        const info = agent
          ? await window.lenz.agents.launch({
              profileId: agent.profileId,
              name: agent.name,
              cwd,
              cols,
              rows,
              // First start sends the task; later starts pick the conversation back up.
              ...(agent.sessionId ? { resumeSessionId: agent.sessionId } : { prompt: agent.prompt }),
              ...(home?.space.kind === 'task' ? { trustFrom: home.project.path } : {}),
            })
          : await daemon.request('terminal.create', { cwd, cols, rows })
        if (disposed) {
          void daemon.request('terminal.kill', { id: info.id }).catch(() => undefined)
          return
        }
        id = info.id
        terminalId = id
        if (agent) {
          const { prompt: _sent, ...rest } = agent
          setTerminalId(paneRef.current.id, id, {
            ...rest,
            sessionId: info.agent?.sessionId ?? agent.sessionId,
          })
        } else {
          setTerminalId(paneRef.current.id, id)
        }
        replay = await daemon.request('terminal.attach', { id })
      }
      if (disposed) return
      // The squad list learns the agent's current state without waiting for its next change.
      if (replay.info.status) useAgentStatus.getState().setStatus(replay.info.id, replay.info.status)

      term.reset()
      term.write(replay.snapshot)
      lastSeq = replay.seq
      attached = true
      for (const chunk of early.splice(0)) {
        if (chunk.seq > lastSeq) {
          lastSeq = chunk.seq
          term.write(chunk.data)
        }
      }
    }

    function start(): void {
      attach().catch((error: Error) => {
        if (!disposed) term.write(`\r\n\x1b[31mLenz no pudo abrir el terminal: ${error.message}\x1b[0m\r\n`)
      })
    }

    term.onData((data) => {
      if (terminalId) void daemon.request('terminal.write', { id: terminalId, data }).catch(() => undefined)
    })
    term.onResize(({ cols, rows }) => {
      if (terminalId && attached) {
        void daemon.request('terminal.resize', { id: terminalId, cols, rows }).catch(() => undefined)
      }
    })

    const offReconnected = daemon.onReconnected(start)

    let frame = 0
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(fitIfVisible)
    })

    // Measure with the real font, or the cell grid comes out wrong.
    void document.fonts.load(`${TERMINAL_FONT_SIZE}px 'Geist Mono Variable'`).finally(() => {
      if (disposed) return
      // DOM renderer: @xterm/addon-webgl drew glyphs with a default font on
      // Electron 45 (any fontFamily), so it stays off until that is fixed.
      term.open(container)
      fitIfVisible()
      observer.observe(container)
      if (focusedRef.current) term.focus()
      start()
    })

    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      observer.disconnect()
      offEvent()
      offReconnected()
      if (terminalId && attached)
        void daemon.request('terminal.detach', { id: terminalId }).catch(() => undefined)
      termRef.current = null
      term.dispose()
    }
  }, [])

  useEffect(() => {
    if (focused) termRef.current?.focus()
  }, [focused])

  return <div ref={containerRef} className="h-full w-full overflow-hidden px-2 pt-1" />
}
