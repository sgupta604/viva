import { useMemo } from "react";
import ReactFlow, {
  Background,
  Controls,
  type Node,
  type Edge as RFEdge,
  MarkerType,
} from "reactflow";
import "reactflow/dist/style.css";

import { useGraphStore } from "@/lib/state/graph-store";
import { useSelectionStore } from "@/lib/state/selection-store";
import { useFilterStore } from "@/lib/state/filter-store";
import { applyFilters } from "@/lib/filters/predicates";
import { computeLayout } from "@/lib/graph/layout";
import { edgeStyleFor } from "./EdgeStyles";
import FileNode from "./FileNode";
import FolderGroup from "./FolderGroup";

const nodeTypes = {
  file: FileNode,
  folder: FolderGroup,
};

export function GraphCanvas() {
  const graph = useGraphStore((s) => s.graph);
  const kinds = useFilterStore((s) => s.kinds);
  const hideTests = useFilterStore((s) => s.hideTests);
  const folder = useFilterStore((s) => s.folder);
  const searchQuery = useFilterStore((s) => s.searchQuery);
  const selectFile = useSelectionStore((s) => s.selectFile);
  const selectedFileId = useSelectionStore((s) => s.selectedFileId);

  const filtered = useMemo(() => {
    if (!graph) return null;
    return applyFilters(graph, { kinds, hideTests, folder, searchQuery });
  }, [graph, kinds, hideTests, folder, searchQuery]);

  const layout = useMemo(() => (filtered ? computeLayout(filtered) : null), [filtered]);

  const rfNodes: Node[] = useMemo(() => {
    if (!layout) return [];
    return layout.nodes.map((n) => ({
      id: n.id,
      type: "file",
      position: { x: n.x, y: n.y },
      data: { file: n.file },
      selected: n.id === selectedFileId,
    }));
  }, [layout, selectedFileId]);

  const rfEdges: RFEdge[] = useMemo(() => {
    if (!layout) return [];
    return layout.edges
      .filter((e) => e.target !== null)
      .map((e) => {
        const style = edgeStyleFor(e.kind, !!e.unresolved);
        return {
          id: e.id,
          source: e.source,
          target: e.target as string,
          type: "smoothstep",
          style,
          markerEnd: { type: MarkerType.ArrowClosed, color: style.stroke },
          data: { kind: e.kind, unresolved: e.unresolved },
          label: e.kind,
          labelStyle: { fontSize: 10, fill: "#9ca3af" },
        };
      });
  }, [layout]);

  if (!filtered || !layout) return null;

  return (
    <div className="h-full w-full" data-testid="graph-canvas">
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        onNodeClick={(_e, node) => selectFile(node.id)}
        onPaneClick={() => selectFile(null)}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={16} color="#1f2937" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
