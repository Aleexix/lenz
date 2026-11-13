import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal } from "@xterm/xterm";
import { useEffect, useRef } from "react";
import { attachSession, resizeSession, writeInput } from "@/lib/ipc";
import { terminalTheme } from "./theme";

type TerminalViewProps = {
  sessionId: string;
  onExit?: (code: number | null) => void;
};

/**
 * Terminal xterm.js conectada a una sesión del daemon.
 * TODO(fase 2): pool de renderers WebGL y vista previa en `<pre>` (ARQUITECTURA.md §7.2).
 */
export function TerminalView({ sessionId, onExit }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new Terminal({
      fontFamily: '"Geist Mono Variable", ui-monospace, monospace',
      fontSize: 13,
      cursorBlink: true,
      scrollback: 5000,
      theme: terminalTheme,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(container);
    try {
      const webgl = new WebglAddon();
      webgl.onContextLoss(() => webgl.dispose());
      term.loadAddon(webgl);
    } catch {
      // Sin WebGL: xterm usa el renderer DOM.
    }
    fit.fit();

    let disposed = false;
    let detach: (() => Promise<void>) | null = null;

    attachSession(sessionId, (event) => {
      if (event.kind === "snapshot") {
        term.reset();
        term.write(event.data);
      } else if (event.kind === "output") {
        term.write(event.data);
      } else {
        const code = event.code === null ? "" : ` · código ${event.code}`;
        term.write(`\r\n\x1b[2m[proceso terminado${code}]\x1b[0m\r\n`);
        onExitRef.current?.(event.code);
      }
    })
      .then((unsubscribe) => {
        if (disposed) void unsubscribe();
        else detach = unsubscribe;
      })
      .catch((error: unknown) => {
        term.write(`\x1b[31m${String(error)}\x1b[0m\r\n`);
      });

    const report = () => void resizeSession(sessionId, term.cols, term.rows).catch(() => {});
    report();
    const dataSub = term.onData((data) => void writeInput(sessionId, data).catch(() => {}));
    const resizeSub = term.onResize(report);
    const observer = new ResizeObserver(() => fit.fit());
    observer.observe(container);

    return () => {
      disposed = true;
      observer.disconnect();
      dataSub.dispose();
      resizeSub.dispose();
      void detach?.();
      term.dispose();
    };
  }, [sessionId]);

  return <div ref={containerRef} className="h-full w-full" />;
}
