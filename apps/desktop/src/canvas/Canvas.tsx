import { Background, BackgroundVariant, Controls, MiniMap, ReactFlow } from "@xyflow/react";
import { useCanvasStore } from "@/stores/canvas-store";
import { nodeTypes } from "./node-types";

export function Canvas() {
  const nodes = useCanvasStore((s) => s.nodes);
  const onNodesChange = useCanvasStore((s) => s.onNodesChange);

  return (
    <ReactFlow
      nodes={nodes}
      onNodesChange={onNodesChange}
      nodeTypes={nodeTypes}
      colorMode="dark"
      fitView
      // Nunca agrandar por encima de 1: las terminales se ven nítidas solo a escala real.
      fitViewOptions={{ maxZoom: 1, padding: 0.15 }}
      minZoom={0.2}
      maxZoom={1.5}
      proOptions={{ hideAttribution: true }}
    >
      <Background variant={BackgroundVariant.Dots} gap={24} size={1} />
      <Controls showInteractive={false} />
      <MiniMap pannable zoomable />
    </ReactFlow>
  );
}
