/** Medidas del lienzo compartidas por los nodos y el store. */
export const TERMINAL_NODE_WIDTH = 640;
export const TERMINAL_NODE_HEIGHT = 400;
export const GRID_GAP = 40;
export const GRID_COLUMNS = 2;

/** Posición de la celda `index` en la grilla temporal (fase 2: layout persistido). */
export const gridPosition = (index: number) => ({
  x: (index % GRID_COLUMNS) * (TERMINAL_NODE_WIDTH + GRID_GAP),
  y: Math.floor(index / GRID_COLUMNS) * (TERMINAL_NODE_HEIGHT + GRID_GAP),
});
