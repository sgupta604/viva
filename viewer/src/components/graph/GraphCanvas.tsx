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
import { computeDendrogramLayout } from "@/lib/graph/dendrogram-layout";
import {
  edgeStyleFor,
  shouldDisablePointerEvents,
  treeEdgeStyleFor,
  crossRefOpacityFor,
} from "./EdgeStyles";
import { EdgeLegend } from "./EdgeLegend";
import FileNode from "./FileNode";
import ClusterNode from "./ClusterNode";
import TreeFolderNode from "./TreeFolderNode";
import TreeFileNode from "./TreeFileNode";
import { zoomModeFor, type ZoomMode } from "./SemanticZoom";

// React Flow node-type registry. `treeFolder` / `treeFile` are emitted by
// computeDendrogramLayout; the existing `cluster` / `file` come from
// computeClusterLayout. computeTreeLayout reuses `cluster` / `file` (its
// nodes are still containment boxes, just laid out by mrtree).
const nodeTypes = {
  file: FileNode,
  cluster: ClusterNode,
  treeFolder: TreeFolderNode,
  treeFile: TreeFileNode,
};

/** Inner component — must be rendered inside ReactFlowProvider (see App.tsx). */
export function GraphCanvas() {
  const graph = useGraphStore((s) => s.graph);
  const kinds = useFilterStore((s) => s.kinds);
  const hideTests = useFilterStore((s) => s.hideTests);
  const searchQuery = useFilterStore((s) => s.searchQuery);
  const selectFile = useSelectionStore((s) => s.selectFile);
  const selectedFileId = useSelectionStore((s) => s.selectedFileId);
  const hoveredNodeId = useSelectionStore((s) => s.hoveredNodeId);
  const hoverNode = useSelectionStore((s) => s.hoverNode);
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

  // Cluster mode is sync (recursive grid-pack on the main thread); the two
  // flat modes (dendrogram, tree) are async (ELK mrtree via the elkjs Web
  // Worker, with main-thread fallback in jsdom). All three produce
  // LaidOutClusterGraph — React Flow downstream branches only on the node
  // `kind` field (cluster/file vs treeFolder/treeFile). Cluster mode
  // preserves its synchronous render path so the existing cluster e2e +
  // Vitest specs stay green.
  const clusterLayout = useMemo<LaidOutClusterGraph | null>(() => {
    if (!filtered) return null;
    if (graphLayout !== "clusters") return null;
    return computeClusterLayout(filtered, expanded);
  }, [filtered, expanded, graphLayout]);

  const [asyncLayout, setAsyncLayout] = useState<LaidOutClusterGraph | null>(null);
  // Worker-error surface — when the async layout fails, show a dismissible
  // banner so the user (and visual-review screenshots) can see something
  // went wrong instead of staring at a blank canvas. Console.error stays as
  // a breadcrumb for /diagnose. Cleared on every successful compute.
  const [layoutError, setLayoutError] = useState<string | null>(null);
  useEffect(() => {
    if (!filtered || graphLayout === "clusters") {
      setAsyncLayout(null);
      return;
    }
    let stale = false;
    // 3-way dispatch: dendrogram ↔ tree both use the async ELK worker path;
    // they differ in which layout function they call (flat-with-injected-
    // hierarchy-edges vs cluster-as-containment-mrtree). Both `then` into
    // the same setAsyncLayout — toggling between the two flat modes
    // doesn't double-render because the previous-mode result is replaced
    // by the new-mode result on the same setter.
    const layoutFn =
      graphLayout === "dendrogram" ? computeDendrogramLayout : computeTreeLayout;
    const layoutName =
      graphLayout === "dendrogram" ? "computeDendrogramLayout" : "computeTreeLayout";
    layoutFn(filtered, expanded)
      .then((laid) => {
        if (stale) return;
        setAsyncLayout(laid);
        setLayoutError(null);
      })
      .catch((err: unknown) => {
        if (stale) return;
        // Don't blank the canvas on transient worker errors — keep the last
        // good layout. Surface to console so /diagnose has a breadcrumb.
        const message = err instanceof Error ? err.message : String(err);
        // eslint-disable-next-line no-console
        console.error(`${layoutName} failed`, err);
        setLayoutError(message);
      });
    return () => {
      stale = true;
    };
  }, [filtered, expanded, graphLayout]);

  const layout = graphLayout === "clusters" ? clusterLayout : asyncLayout;

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
      if (n.kind === "treeFolder") {
        // Dendrogram folder card — flat (no parentNode), click-to-expand
        // routed through hierarchyStore inside TreeFolderNode itself. Not
        // selectable (the cluster doesn't represent a file selection), not
        // draggable (drift would break the dendrogram alignment).
        //
        // zIndex: 1100 lifts treeFolder cards above the edge layer (which
        // sits at zIndex: 1000 — see edge-z-order comment below). Without
        // this, hierarchy edges drawn over a folder card intercept the
        // pointer and Playwright's strict actionability check fails the
        // click ("element intercepts pointer events"). This is the fix for
        // the dendrogram-layout E2E "expand state survives round-trip"
        // failure (folder.click() failing because d-aggregate hierarchy
        // edges sat above the card).
        return {
          id: n.id,
          type: "treeFolder",
          position: { x: n.x, y: n.y },
          zIndex: 1100,
          data: {
            cluster: n.cluster!,
            expanded: n.expanded!,
            // Same total-descendant logic as ClusterNode — direct count
            // reads as 0 for parents whose files live in nested folders.
            childCount: n.totalDescendantFiles ?? n.childCount ?? 0,
          },
          style: { width: n.width, height: n.height },
          selectable: false,
          draggable: false,
        };
      }
      if (n.kind === "treeFile") {
        // Dendrogram leaf card — flat. Click selection still routed through
        // ReactFlow's onNodeClick handler below (consistent with FileNode).
        // zIndex: 1100 — same rationale as treeFolder above; keeps clicks
        // landing on the leaf card rather than on overlaid hierarchy edges.
        return {
          id: n.id,
          type: "treeFile",
          position: { x: n.x, y: n.y },
          zIndex: 1100,
          data: { file: n.file! },
          selected: n.id === selectedFileId,
          style: { width: n.width, height: n.height },
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

  // Both flat modes (dendrogram + tree) share the 2-color hierarchy/reference
  // edge palette and suppress always-on labels. Cluster mode keeps the full
  // 6-color palette + ×N chips (user said cluster info-density is fine).
  const isFlatMode = graphLayout === "dendrogram" || graphLayout === "tree";
  const rfEdges: RFEdge[] = useMemo(() => {
    if (!layout) return [];
    return layout.edges.map((e) => {
      // Flat modes (dendrogram, tree) collapse to 2 colors (hierarchy +
      // cross-ref) per user feedback 2026-04-22 — the 6-color palette was
      // unreadable as the default. Cluster mode keeps the full per-kind
      // palette.
      const style = isFlatMode
        ? treeEdgeStyleFor(e.kind, !!e.unresolved)
        : edgeStyleFor(e.kind, !!e.unresolved);
      const isAggregated = e.count > 1;
      // Q3 (research): direct edges show their kind label only on hover
      // (the color + legend already convey the kind). Aggregated edges keep
      // their always-on `×N` label because the count is real information
      // that hover-to-discover would hide.
      //
      // Flat-mode override (user feedback 2026-04-22): NO always-on labels
      // at all. The default flat view is too dense — even `include ×3`
      // chips piled up unreadably. Aggregated count + kind are surfaced
      // via the edge's accessible label (browser tooltip on hover of the
      // SVG path) instead. Cluster mode keeps the always-on `×N` chips
      // since the user said cluster info-density is fine.
      const aggregatedChip = isAggregated ? `${e.kind} ×${e.count}` : undefined;
      const isEndpointSelected =
        selectedFileId !== null &&
        (e.source === selectedFileId || e.target === selectedFileId);
      const visibleLabel = isFlatMode
        ? undefined
        : aggregatedChip ?? (isEndpointSelected ? e.kind : undefined);
      const hoverDescription = isAggregated
        ? `${e.kind} ×${e.count}`
        : e.kind;
      // Z-ORDER (FR7): React Flow paints edges below compound parentNode
      // children by default. Bump zIndex so config edges stay visible
      // crossing a cluster fill — fixes the "d-aggregate ×12 underneath
      // parameters.d / resolve.d" symptom from image copy.png.
      //
      // POINTER-EVENTS (flat modes only): in dendrogram + tree mode the
      // d-aggregate "hierarchy" edges are decorative backbone — they exist
      // to draw the spine of the tree, not to be clicked. With zIndex 1000
      // they sit above the canvas and (before the treeFolder/treeFile
      // zIndex bump) could intercept clicks meant for folder cards. Even
      // with the node z-index fix, killing pointer events here is
      // defense-in-depth: hierarchy edges should never eat a user click.
      // Cluster-mode hierarchy edges stay clickable because cluster boxes
      // ARE the legitimate edge endpoints in that view, and cross-ref
      // edges (include/import/ref/xsd/logical-id) keep pointer events in
      // every mode because users may click them to inspect the relation.
      const isHierarchyInFlatMode = shouldDisablePointerEvents(
        e.kind,
        isFlatMode,
      );
      // Focus + context dimming (user feedback 2026-04-22, post-images
      // #13/#14): cross-ref edges in flat modes recede to ~15% opacity
      // unless the hovered or selected node is one of their endpoints.
      // Hierarchy edges and cluster mode are exempt — see crossRefOpacityFor
      // for the per-mode rules. Computed per-edge inside this useMemo so a
      // hover state change triggers ONE re-map (cheap; flat-mode edge counts
      // are bounded by the visible-node fan-out).
      //
      // Selection counts as "focused" right alongside hover so that opening
      // a file's detail panel keeps that file's connections lit even after
      // the mouse moves away — matches the natural "I clicked this; show me
      // its world" mental model.
      const focusedNodeId = hoveredNodeId ?? selectedFileId;
      const isFocused =
        focusedNodeId !== null &&
        (e.source === focusedNodeId || e.target === focusedNodeId);
      const opacity = crossRefOpacityFor(e.kind, isFlatMode, isFocused);
      // Bezier curves for cross-ref edges in flat modes (Change 2): the
      // smoothstep orthogonal routing inherited from elkjs's mrtree was the
      // visual culprit behind images #13/#14 — straight horizontal/vertical
      // segments through sibling rows. Bezier curves arc away from the
      // tree's main axes and naturally avoid passing through node bodies.
      // Hierarchy edges KEEP smoothstep so the tree backbone stays crisp
      // and rectilinear; cluster mode is unchanged.
      const useBezier = isFlatMode && e.kind !== "d-aggregate";
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        type: useBezier ? "default" : "smoothstep",
        zIndex: 1000,
        style: {
          ...style,
          strokeWidth: isAggregated
            ? Math.min(6, 1.5 + Math.log2(e.count))
            : style.strokeWidth,
          opacity,
          ...(isHierarchyInFlatMode ? { pointerEvents: "none" as const } : {}),
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: style.stroke,
        },
        // ariaLabel renders as a native browser tooltip on the SVG path
        // (React Flow forwards it onto the edge group). Gives tree-mode
        // edges a hover-to-discover affordance without polluting the
        // canvas with always-on chips.
        ariaLabel: hoverDescription,
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
        label: visibleLabel,
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
  }, [layout, selectedFileId, hoveredNodeId, isFlatMode]);

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
          // File nodes are click-selectable (both `file` from cluster mode
          // and `treeFile` from dendrogram mode). Cluster / treeFolder
          // nodes have their own toggle handlers.
          if (node.type === "file" || node.type === "treeFile") selectFile(node.id);
        }}
        // Hover handlers drive the focus + context dimming of cross-ref
        // edges. The store update is cheap (one Zustand set), and React
        // Flow throttles its own mouse events, so we don't need to
        // debounce here. Mouse-leave clears the hover so edges return to
        // the dim default state. The onPaneClick handler also clears
        // hover defensively in case the leave event was missed (e.g. the
        // pointer left through a gap between two nodes the engine missed).
        onNodeMouseEnter={(_e, node) => hoverNode(node.id)}
        onNodeMouseLeave={() => hoverNode(null)}
        onPaneClick={() => {
          selectFile(null);
          hoverNode(null);
        }}
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

