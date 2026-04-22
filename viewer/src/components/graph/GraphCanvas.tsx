import { useEffect, useMemo, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  type Node,
  type Edge as RFEdge,
  MarkerType,
  useOnViewportChange,
  type Viewport,
} from "reactflow";
import "reactflow/dist/style.css";

import { useGraphStore } from "@/lib/state/graph-store";
import { useSelectionStore } from "@/lib/state/selection-store";
import { useFilterStore } from "@/lib/state/filter-store";
import { useHierarchyStore } from "@/lib/state/hierarchy-store";
import { useViewStore } from "@/lib/state/view-store";
import { applyFilters } from "@/lib/filters/predicates";
import {
  computeClusterLayout,
  type LaidOutClusterGraph,
} from "@/lib/graph/cluster-layout";
import { computeTreeLayout } from "@/lib/graph/tree-layout";
import { edgeStyleFor, treeEdgeStyleFor } from "./EdgeStyles";
import { EdgeLegend } from "./EdgeLegend";
import FileNode from "./FileNode";
import ClusterNode from "./ClusterNode";
import { zoomModeFor, type ZoomMode } from "./SemanticZoom";

const nodeTypes = {
  file: FileNode,
  cluster: ClusterNode,
};

/** Inner component — must be rendered inside ReactFlowProvider (see App.tsx). */
export function GraphCanvas() {
  const graph = useGraphStore((s) => s.graph);
  const kinds = useFilterStore((s) => s.kinds);
  const hideTests = useFilterStore((s) => s.hideTests);
  const searchQuery = useFilterStore((s) => s.searchQuery);
  const selectFile = useSelectionStore((s) => s.selectFile);
  const selectedFileId = useSelectionStore((s) => s.selectedFileId);
  const expanded = useHierarchyStore((s) => s.expanded);
  const expand = useHierarchyStore((s) => s.expand);
  const graphLayout = useViewStore((s) => s.graphLayout);

  const [zoomMode, setZoomMode] = useState<ZoomMode>("detail");
  // Listen for viewport changes; flip CSS class, never recompute layout.
  useOnViewportChange({
    onChange: (vp: Viewport) => {
      const next = zoomModeFor(vp.zoom);
      setZoomMode((cur) => (cur === next ? cur : next));
    },
  });

  // On first load, auto-expand the top-level if there's exactly one top
  // cluster (auto-descend-on-single-child-root — Q3 / V.10 requirement).
  useEffect(() => {
    if (!graph) return;
    const clusters = graph.clusters ?? [];
    if (clusters.length === 0) return;
    const topClusters = clusters.filter((c) => c.parent === null);
    if (topClusters.length === 1 && !expanded.has(topClusters[0].path)) {
      expand(topClusters[0].path);
    }
    // Only run when graph changes — expanded reads avoid re-firing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph]);

  const filtered = useMemo(() => {
    if (!graph) return null;
    // v2: folder filter → HIDE semantics is replaced by NAVIGATE (V.7). For
    // GraphCanvas we ignore state.folder and leave folder-driven navigation
    // to FilterBar's expandToPath + fitBounds.
    return applyFilters(graph, {
      kinds,
      hideTests,
      folder: null,
      searchQuery,
    });
  }, [graph, kinds, hideTests, searchQuery]);

  // Cluster mode is sync (recursive grid-pack on the main thread); tree mode
  // is async (mrtree via the elkjs Web Worker, with main-thread fallback in
  // jsdom). Both produce LaidOutClusterGraph — React Flow downstream is
  // identical. Cluster mode preserves its synchronous render path so the
  // existing cluster e2e + Vitest specs stay green.
  const clusterLayout = useMemo<LaidOutClusterGraph | null>(() => {
    if (!filtered) return null;
    if (graphLayout !== "clusters") return null;
    return computeClusterLayout(filtered, expanded);
  }, [filtered, expanded, graphLayout]);

  const [treeLayout, setTreeLayout] = useState<LaidOutClusterGraph | null>(null);
  // Worker-error surface — when computeTreeLayout fails, show a dismissible
  // banner so the user (and visual-review screenshots) can see something
  // went wrong instead of staring at a blank canvas. Console.error stays as
  // a breadcrumb for /diagnose. Cleared on every successful compute.
  const [layoutError, setLayoutError] = useState<string | null>(null);
  useEffect(() => {
    if (!filtered || graphLayout !== "tree") {
      setTreeLayout(null);
      return;
    }
    let stale = false;
    computeTreeLayout(filtered, expanded)
      .then((laid) => {
        if (stale) return;
        setTreeLayout(laid);
        setLayoutError(null);
      })
      .catch((err: unknown) => {
        if (stale) return;
        // Don't blank the canvas on transient worker errors — keep the last
        // good layout. Surface to console so /diagnose has a breadcrumb.
        const message = err instanceof Error ? err.message : String(err);
        // eslint-disable-next-line no-console
        console.error("computeTreeLayout failed", err);
        setLayoutError(message);
      });
    return () => {
      stale = true;
    };
  }, [filtered, expanded, graphLayout]);

  const layout = graphLayout === "tree" ? treeLayout : clusterLayout;

  const rfNodes: Node[] = useMemo(() => {
    if (!layout) return [];
    return layout.nodes.map((n) => {
      if (n.kind === "cluster") {
        return {
          id: n.id,
          type: "cluster",
          // Nested cluster nodes MUST declare parentNode, or React Flow
          // interprets their cluster-layout-emitted positions (which are
          // parent-relative) as absolute and every descendant overlaps its
          // uncle clusters (BLOCKER 1 from post-finalize visual-verify).
          parentNode: n.parent ?? undefined,
          extent: n.parent ? ("parent" as const) : undefined,
          position: { x: n.x, y: n.y },
          data: {
            cluster: n.cluster!,
            expanded: n.expanded!,
            // Badge shows TOTAL descendant file count (BLOCKER 2), falling
            // back to direct childCount for graphs that predate the fix.
            childCount: n.totalDescendantFiles ?? n.childCount ?? 0,
          },
          style: { width: n.width, height: n.height },
          selectable: false,
          draggable: false,
        };
      }
      return {
        id: n.id,
        type: "file",
        // File nodes living inside an expanded cluster use `parentNode` so
        // React Flow keeps them pinned to the cluster's area; position is
        // relative to the cluster.
        parentNode: n.parent ?? undefined,
        extent: n.parent ? ("parent" as const) : undefined,
        position: { x: n.x, y: n.y },
        data: { file: n.file! },
        selected: n.id === selectedFileId,
      };
    });
  }, [layout, selectedFileId]);

  const isTreeMode = graphLayout === "tree";
  const rfEdges: RFEdge[] = useMemo(() => {
    if (!layout) return [];
    return layout.edges.map((e) => {
      // Tree mode collapses to 2 colors (hierarchy + cross-ref) per user
      // feedback 2026-04-22 — the 6-color palette was unreadable as the
      // default. Cluster mode keeps the full per-kind palette.
      const style = isTreeMode
        ? treeEdgeStyleFor(e.kind, !!e.unresolved)
        : edgeStyleFor(e.kind, !!e.unresolved);
      const isAggregated = e.count > 1;
      // Q3 (research): direct edges show their kind label only on hover
      // (the color + legend already convey the kind). Aggregated edges keep
      // their always-on `×N` label because the count is real information
      // that hover-to-discover would hide.
      const label = isAggregated ? `${e.kind} ×${e.count}` : undefined;
      const isEndpointSelected =
        selectedFileId !== null &&
        (e.source === selectedFileId || e.target === selectedFileId);
      // Z-ORDER (FR7): React Flow paints edges below compound parentNode
      // children by default. Bump zIndex so config edges stay visible
      // crossing a cluster fill — fixes the "d-aggregate ×12 underneath
      // parameters.d / resolve.d" symptom from image copy.png.
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        type: "smoothstep",
        zIndex: 1000,
        style: {
          ...style,
          strokeWidth: isAggregated
            ? Math.min(6, 1.5 + Math.log2(e.count))
            : style.strokeWidth,
        },
        markerEnd: { type: MarkerType.ArrowClosed, color: style.stroke },
        data: {
          kind: e.kind,
          unresolved: e.unresolved,
          count: e.count,
          kindBreakdown: e.kindBreakdown,
          // Direct labels render on hover via CSS — keep the kind here so
          // the future hover-popover or tooltip can read it without
          // reconstructing from `data.kind`.
          directLabel: e.kind,
        },
        // For non-aggregated edges with a selected endpoint we surface the
        // kind label too (helps when the user is inspecting a file's
        // outgoing edges). Otherwise undefined → React Flow omits the DOM.
        label: label ?? (isEndpointSelected ? e.kind : undefined),
        labelStyle: {
          fontSize: 10,
          fill: "#d1d5db",
          fontWeight: 500,
          // Stroke-outline so glyphs read cleanly even if a cluster border
          // peeks through the background.
          paintOrder: "stroke",
          stroke: "#0a0a0a",
          strokeWidth: 2,
          strokeLinejoin: "round",
          // pointer-events:none so a label can never steal hover from the
          // edge or a node it overlays.
          pointerEvents: "none",
        },
        labelShowBg: true,
        // Opaque near-black background with generous padding + rounded
        // corners so the label stands proud of whatever cluster border
        // happens to sit underneath.
        labelBgStyle: {
          fill: "#0a0a0a",
          fillOpacity: 1,
          pointerEvents: "none",
        },
        labelBgPadding: [10, 6] as [number, number],
        labelBgBorderRadius: 6,
      };
    });
  }, [layout, selectedFileId, isTreeMode]);

  // Pre-layout state — render a stable skeleton instead of returning null.
  // Two reasons:
  //   1. UX: tree mode runs ELK off-main-thread and on a 3k-file fixture
  //      mrtree can take >1s. A blank dark panel during that window looks
  //      broken and was the visible symptom of the worker hang we just
  //      fixed (diagnosis 2026-04-22).
  //   2. Test stability: every E2E `getByTestId("graph-canvas")` selector
  //      now resolves immediately on slow CI machines, so a slow ELK
  //      compute can't masquerade as a hang.
  if (!filtered || !layout) {
    return (
      <div
        className="relative flex h-full w-full items-center justify-center"
        data-testid="graph-canvas"
        data-loading="true"
        data-zoom-mode={zoomMode}
        role="status"
        aria-live="polite"
        aria-label="Computing graph layout"
      >
        <div className="flex flex-col items-center gap-3 text-neutral-400">
          <span
            aria-hidden="true"
            className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-neutral-700 border-t-neutral-300"
          />
          <span className="font-mono text-xs">Computing layout…</span>
        </div>
        {layoutError ? (
          <div
            data-testid="layout-error"
            role="alert"
            className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-md border border-red-700 bg-red-950/95 px-3 py-2 font-mono text-xs text-red-200 shadow-lg"
          >
            <span className="font-semibold">Layout failed:</span>{" "}
            <span className="font-normal">{layoutError}</span>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className="relative h-full w-full"
      data-testid="graph-canvas"
      data-loading="false"
      data-zoom-mode={zoomMode}
    >
      {layoutError ? (
        <div
          data-testid="layout-error"
          role="alert"
          className="absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded-md border border-red-700 bg-red-950/95 px-3 py-2 font-mono text-xs text-red-200 shadow-lg"
        >
          <span className="font-semibold">Layout failed:</span>{" "}
          <span className="font-normal">{layoutError}</span>
          <button
            type="button"
            onClick={() => setLayoutError(null)}
            className="ml-3 text-red-400 hover:text-red-200"
            aria-label="Dismiss layout error"
          >
            ×
          </button>
        </div>
      ) : null}
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        onNodeClick={(_e, node) => {
          // Only file nodes are click-selectable (cluster nodes have their
          // own header toggle handler).
          if (node.type === "file") selectFile(node.id);
        }}
        onPaneClick={() => selectFile(null)}
        fitView
        // minZoom raised from 0.05 — at 0.05 a 3k-file graph collapsed
        // into a ~60×20 px smudge, which is useless. 0.2 keeps tops
        // legible as tiles even at the deepest allowed zoom-out.
        // maxZoom pinned to 2 so file-name labels stay readable without
        // rendering gigantic, pixel-fuzzy nodes.
        minZoom={0.2}
        maxZoom={2}
        nodesConnectable={false}
        edgesUpdatable={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={16} color="#1f2937" />
        <Controls showInteractive={false} />
      </ReactFlow>
      <EdgeLegend />
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

