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
          labelStyle: { fontSize: 10, fill: "#d1d5db", fontWeight: 500 },
          labelShowBg: true,
          labelBgStyle: { fill: "#0a0a0a", fillOpacity: 0.95 },
          labelBgPadding: [6, 3] as [number, number],
          labelBgBorderRadius: 3,
        };
      });
  }, [layout]);

  if (!filtered || !layout) return null;

  return (
    <div className="relative h-full w-full" data-testid="graph-canvas">
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        onNodeClick={(_e, node) => selectFile(node.id)}
        onPaneClick={() => selectFile(null)}
        fitView
        minZoom={0.1}
        nodesConnectable={false}
        edgesUpdatable={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={16} color="#1f2937" />
        <Controls showInteractive={false} />
      </ReactFlow>
      <div
        data-testid="readonly-hint"
        title="The graph reflects parsed code. Editing modes are not yet available."
        className="pointer-events-none absolute bottom-3 right-3 z-10 flex items-center gap-1.5 rounded-md border border-neutral-700 bg-neutral-900/80 px-2 py-1 font-mono text-[11px] text-neutral-400 shadow-sm backdrop-blur-sm"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          width="11"
          height="11"
          fill="currentColor"
        >
          <path d="M5 7V5a3 3 0 1 1 6 0v2h.5A1.5 1.5 0 0 1 13 8.5v4A1.5 1.5 0 0 1 11.5 14h-7A1.5 1.5 0 0 1 3 12.5v-4A1.5 1.5 0 0 1 4.5 7H5Zm1 0h4V5a2 2 0 1 0-4 0v2Z" />
        </svg>
        <span>Read-only view — graph reflects parsed code</span>
      </div>
    </div>
  );
}
