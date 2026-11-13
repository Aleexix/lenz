import type { NodeTypes } from "@xyflow/react";
import { TerminalNode } from "./nodes/TerminalNode";

/**
 * Registro de tipos de nodo del lienzo. Para agregar uno nuevo:
 * 1. Crea el componente en `canvas/nodes/`.
 * 2. Regístralo aquí.
 * 3. Agrega su tipo de datos en `canvas/types.ts`.
 */
export const nodeTypes = {
  terminal: TerminalNode,
} satisfies NodeTypes;
