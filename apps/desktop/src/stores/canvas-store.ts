import { applyNodeChanges, type NodeChange } from "@xyflow/react";
import { create } from "zustand";
import { gridPosition } from "@/canvas/layout";
import type { LenzNode, TerminalNodeType } from "@/canvas/types";
import { closeSession, createSession, listSessions, type SessionInfo } from "@/lib/ipc";

type LoadStatus = "idle" | "loading" | "ready" | "error";

type CanvasState = {
  nodes: LenzNode[];
  status: LoadStatus;
  error: string | null;
  onNodesChange: (changes: NodeChange<LenzNode>[]) => void;
  /** Trae las sesiones vivas del daemon y arma un nodo por cada una. */
  loadSessions: () => Promise<void>;
  addTerminal: () => Promise<void>;
  closeTerminal: (sessionId: string) => Promise<void>;
  markExited: (sessionId: string, code: number | null) => void;
};

// Tamaño inicial del PTY; la terminal lo ajusta al tamaño real del nodo al montarse.
const INITIAL_COLS = 100;
const INITIAL_ROWS = 30;

/** Primera celda de la grilla que no ocupa ningún nodo. TODO(fase 2): layout persistido. */
function freePosition(nodes: LenzNode[]) {
  const taken = new Set(nodes.map((n) => `${n.position.x},${n.position.y}`));
  for (let i = 0; ; i++) {
    const p = gridPosition(i);
    if (!taken.has(`${p.x},${p.y}`)) return p;
  }
}

const toNode = (session: SessionInfo, position: { x: number; y: number }): TerminalNodeType => ({
  id: session.id,
  type: "terminal",
  position,
  dragHandle: ".terminal-drag-handle",
  data: {
    title: session.title,
    sessionId: session.id,
    exited: session.exited,
    exitCode: session.exitCode,
  },
});

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Estado del lienzo en la UI: una copia del daemon, nunca la fuente de la verdad. */
export const useCanvasStore = create<CanvasState>((set, get) => ({
  nodes: [],
  status: "idle",
  error: null,

  onNodesChange: (changes) => set((s) => ({ nodes: applyNodeChanges(changes, s.nodes) })),

  loadSessions: async () => {
    set({ status: "loading", error: null });
    try {
      const sessions = await listSessions();
      set({ nodes: sessions.map((s, i) => toNode(s, gridPosition(i))), status: "ready" });
    } catch (error) {
      set({ status: "error", error: message(error) });
    }
  },

  addTerminal: async () => {
    try {
      const session = await createSession(INITIAL_COLS, INITIAL_ROWS);
      set((s) => ({ nodes: [...s.nodes, toNode(session, freePosition(s.nodes))], error: null }));
    } catch (error) {
      set({ error: message(error) });
    }
  },

  closeTerminal: async (sessionId) => {
    try {
      await closeSession(sessionId);
    } catch (error) {
      // Si el daemon ya no la tiene, igual se quita del lienzo.
      console.warn("close_session", error);
    }
    set({ nodes: get().nodes.filter((n) => n.data.sessionId !== sessionId) });
  },

  markExited: (sessionId, code) =>
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.data.sessionId === sessionId
          ? { ...n, data: { ...n.data, exited: true, exitCode: code } }
          : n,
      ),
    })),
}));
