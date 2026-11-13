import type { Node } from "@xyflow/react";

export type TerminalNodeData = {
  title: string;
  /** Id de la sesión en el daemon. */
  sessionId: string;
  exited: boolean;
  exitCode: number | null;
};

export type TerminalNodeType = Node<TerminalNodeData, "terminal">;

/** Unión de todos los nodos del lienzo. Agrega aquí: note, diff, ascii, group… */
export type LenzNode = TerminalNodeType;
