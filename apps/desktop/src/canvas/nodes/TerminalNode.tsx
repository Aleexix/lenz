import type { NodeProps } from "@xyflow/react";
import { useCanvasStore } from "@/stores/canvas-store";
import { TerminalView } from "@/terminal/TerminalView";
import { TERMINAL_NODE_HEIGHT, TERMINAL_NODE_WIDTH } from "../layout";
import type { TerminalNodeType } from "../types";

export function TerminalNode({ data }: NodeProps<TerminalNodeType>) {
  const closeTerminal = useCanvasStore((s) => s.closeTerminal);
  const markExited = useCanvasStore((s) => s.markExited);

  return (
    <div
      className="flex flex-col overflow-hidden rounded-lg border border-navy-800 bg-navy-950 shadow-xl"
      style={{ width: TERMINAL_NODE_WIDTH, height: TERMINAL_NODE_HEIGHT }}
    >
      {/* La barra de título es el único lugar desde donde se arrastra el nodo. */}
      <div className="terminal-drag-handle flex cursor-grab items-center gap-2 border-b border-navy-800 px-3 py-1.5 font-mono text-xs active:cursor-grabbing">
        <span
          className={`size-2 rounded-full ${data.exited ? "bg-ice/30" : "bg-electric-400"}`}
          aria-hidden
        />
        <span className="flex-1 truncate text-ice/70">{data.title}</span>
        <button
          type="button"
          className="nodrag rounded px-1.5 text-ice/50 hover:bg-navy-800 hover:text-ice"
          title="Cerrar terminal (termina el proceso)"
          aria-label="Cerrar terminal"
          onClick={() => void closeTerminal(data.sessionId)}
        >
          ✕
        </button>
      </div>
      {/* nodrag/nowheel/nopan: la terminal recibe mouse y scroll sin mover el lienzo. */}
      <div className="nodrag nowheel nopan min-h-0 flex-1 p-2">
        <TerminalView
          sessionId={data.sessionId}
          onExit={(code) => markExited(data.sessionId, code)}
        />
      </div>
    </div>
  );
}
