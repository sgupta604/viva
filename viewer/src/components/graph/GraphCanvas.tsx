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
import { usePlanModeStore } from "@/lib/state/plan-mode-store";
import { composePlanGraph } from "@/lib/graph/plan-overlay";
import { applyFilters } from "@/lib/filters/predicates";
import {
  computeClusterLayout,
  type LaidOutClusterGraph,
} from "@/lib/graph/cluster-layout";
import { computeTreeLayout } from "@/lib/graph/tree-layout";
import { computeDendrogramLayout } from "@/lib/graph/dendrogram-layout";
import { getDescendantIds, isFolderId } from "@/lib/graph/descendants";
import {
  edgeStyleFor,
  shouldDisablePointerEvents,
  treeEdgeStyleFor,
  crossRefOpacityFor,
  crossRefInteractionWidthFor,
  focusedCrossRefStrokeFor,
  hierarchyOpacityFor,
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
  const openDetailPanel = useSelectionStore((s) => s.openDetailPanel);
  const expanded = useHierarchyStore((s) => s.expanded);
  const expand = useHierarchyStore((s) => s.expand);
  const graphLayout = useViewStore((s) => s.graphLayout);
  const autoOpenDetailPanel = useViewStore((s) => s.autoOpenDetailPanel);
  // Plan Mode (Phase 1) — read-only composition. The composer is
  // identity-passthrough by REFERENCE EQUALITY when planModeEnabled is false
  // OR there's no active plan, so this wiring changes nothing visible until
  // Phase 2 lands. Selectors read individual primitives so subscriptions stay
  // narrow (re-rendering only when the relevant slice changes).
  const planModeEnabled = usePlanModeStore((s) => s.planModeEnabled);
  const activePlanId = usePlanModeStore((s) => s.activePlanId);
  const plansById = usePlanModeStore((s) => s.plansById);
  const activePlan = activePlanId ? plansById[activePlanId] ?? null : null;

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

  // Plan Mode composition (Phase 1, Stream G — locked plan §1.8). When
  // planModeEnabled is false OR activePlan is null, composePlanGraph returns
  // the SAME `graph` reference (identity-passthrough), so this useMemo
  // collapses to a pass-through and the downstream `filtered` memo never
  // sees a change. The Phase 1 invariant is locked by Vitest in
  // plan-overlay.test.ts AND the headless-invariant Playwright spec.
  const composedGraph = useMemo(() => {
    if (!graph) return null;
    const out = composePlanGraph(graph, activePlan, planModeEnabled);
    return out?.graph ?? graph;
  }, [graph, activePlan, planModeEnabled]);

  const filtered = useMemo(() => {
    if (!composedGraph) return null;
    // v2: folder filter → HIDE semantics is replaced by NAVIGATE (V.7). For
    // GraphCanvas we ignore state.folder and leave folder-driven navigation
    // to FilterBar's expandToPath + fitBounds.
    return applyFilters(composedGraph, {
      kinds,
      hideTests,
      folder: null,
      searchQuery,
    });
  }, [composedGraph, kinds, hideTests, searchQuery]);

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
    // Performance probe — zero-cost in production but lets devtools / scale
    // tests pull layout-compute timing out of `performance.getEntriesByType`.
    // Uses unique mark names per call so concurrent layouts don't collide.
    const perfId = `${graphLayout}-${Date.now()}`;
    performance.mark(`viva.layout.start.${perfId}`);
    layoutFn(filtered, expanded)
      .then((laid) => {
        if (stale) return;
        performance.mark(`viva.layout.end.${perfId}`);
        try {
          performance.measure(
            `viva.layout.${graphLayout}`,
            `viva.layout.start.${perfId}`,
            `viva.layout.end.${perfId}`,
          );
        } catch {
          /* marks may have been cleared */
        }
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

  // "Hover folder, light up its subtree" affordance (user feedback
  // 2026-04-22). When sibling folders are expanded side-by-side in
  // dendrogram / tree mode, their children stack vertically with no visual
  // binding back to their parent. We compute the descendant id set for the
  // currently-focused node (hover takes priority over selection, matching
  // the cross-ref dimming arbitration above) and pass a flag down to
  // TreeFolderNode + TreeFileNode so they can paint a subtle ring on every
  // tile in the subtree. The folder card itself sits in the set too (the
  // helper is inclusive) so its own hover treatment stays in lockstep with
  // its descendants.
  //
  // Cluster mode is intentionally exempt — its containment boxes already
  // make subtree membership visually obvious; layering rings on top would
  // double-up the visual without adding information.
  //
  // Files have no descendants, so when the focused node is a file the
  // helper returns an empty set and the existing single-node-focus path
  // (cross-ref edge dimming + tile hover ring) keeps working unchanged.
  const isFlatMode = graphLayout === "dendrogram" || graphLayout === "tree";
  const focusedNodeId = hoveredNodeId ?? selectedFileId;
  const focusedFolderId = useMemo(() => {
    if (!isFlatMode) return null;
    if (!focusedNodeId) return null;
    return isFolderId(focusedNodeId, graph) ? focusedNodeId : null;
  }, [isFlatMode, focusedNodeId, graph]);
  const subtreeIds = useMemo(
    () => getDescendantIds(focusedFolderId, graph),
    [focusedFolderId, graph],
  );

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
          // uncle clusters (BLOCKER 1 from the post-finalize visual review).
          parentNode: n.parent ?? undefined,
          extent: n.parent ? ("parent" as const) : undefined,
          position: { x: n.x, y: n.y },
          // zIndex: 1100 lifts cluster cards above the edge layer (zIndex
          // 1000) — same rationale as treeFolder/treeFile in dendrogram
          // mode. The user's 2026-04-22 feedback noted that cross-ref edges
          // should pass UNDER tiles ("they go under other tiles"), and now
          // that cluster mode also lights edges on focus the same z-order
          // contract has to apply here. Without this, lit per-kind cross-
          // refs at zIndex 1000 would draw across cluster headers and bleed
          // through their semi-transparent expanded body fill.
          zIndex: 1100,
          data: {
            cluster: n.cluster!,
            expanded: n.expanded!,
            // Badge shows TOTAL descendant file count (BLOCKER 2), falling
            // back to direct childCount for graphs that predate the fix.
            childCount: n.totalDescendantFiles ?? n.childCount ?? 0,
            // polish-batch-1 item 1 — collapsed-cluster intra-edge count
            // surfaced via the `↻ N` pill in ClusterNode. Cluster mode +
            // tree mode both reach this branch (both emit `kind: "cluster"`
            // and render via ClusterNode). Dendrogram mode wires the same
            // count through the `treeFolder` branch below to TreeFolderNode.
            intraClusterEdgeCount: n.intraClusterEdgeCount,
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
        //
        // `descendantOfFocus` is true when this folder card is in the
        // subtree of the currently-focused folder (excluding the focused
        // folder itself — its own hover ring already exists). TreeFolderNode
        // reads this and paints a subtle sky-300/40 ring so the user can
        // see at a glance which sub-folders belong to the hovered parent
        // even when sibling folders are also expanded. Cluster mode skips
        // this entirely because containment already shows scope.
        const isFocusedFolder = n.id === focusedFolderId;
        const descendantOfFocus =
          focusedFolderId !== null &&
          !isFocusedFolder &&
          subtreeIds.has(n.id);
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
            descendantOfFocus,
            // Collapsed-folder intra-edge count (visual-review 2026-04-23
            // — extends polish-batch-1 item 1 from cluster mode to
            // dendrogram mode). TreeFolderNode renders the same `↻ N`
            // pill ClusterNode does whenever this is > 0; hidden when
            // 0/undefined to keep the no-noise rule.
            intraClusterEdgeCount: n.intraClusterEdgeCount,
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
        //
        // `descendantOfFocus` — same purpose as the treeFolder branch
        // above. Files have no descendants of their own, so this only
        // ever flips on when the FOCUSED node is a folder cluster that
        // contains this file (directly or indirectly). TreeFileNode paints
        // a subtle ring around its tile so the user can scan the column
        // of stacked file cards and immediately see which ones live
        // under the hovered folder.
        const descendantOfFocus =
          focusedFolderId !== null && subtreeIds.has(n.id);
        return {
          id: n.id,
          type: "treeFile",
          position: { x: n.x, y: n.y },
          zIndex: 1100,
          data: { file: n.file!, descendantOfFocus },
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
        // zIndex: 1100 lifts cluster-mode file tiles above the edge layer
        // (zIndex 1000) so cross-ref edges pass UNDER tiles per the user's
        // 2026-04-22 feedback. Mirrors treeFile in dendrogram mode and the
        // cluster z-index bump above. Without this, lit per-kind cross-refs
        // would draw across the file card body when its connections are
        // focused, making the tile harder to read in the exact moment the
        // user is focusing on it.
        zIndex: 1100,
        data: { file: n.file! },
        selected: n.id === selectedFileId,
      };
    });
  }, [layout, selectedFileId, focusedFolderId, subtreeIds]);

  // Both flat modes (dendrogram + tree) share the 2-color hierarchy/reference
  // edge palette and suppress always-on labels. Cluster mode keeps the full
  // 6-color palette + ×N chips (user said cluster info-density is fine).
  // (`isFlatMode` is hoisted above the rfNodes memo for the descendant-set
  //  computation; reused here.)
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
      // Focus + context dimming (user feedback 2026-04-22): cross-ref edges
      // recede to ~15% opacity in EVERY mode (dendrogram, tree, clusters)
      // unless the hovered or selected node is one of their endpoints. The
      // dendrogram pattern is now applied uniformly across all three layouts
      // because the user explicitly asked for cluster mode to match: edges
      // greyed out by default, lit only when their tile is focused.
      //
      // Selection counts as "focused" right alongside hover so that opening
      // a file's detail panel keeps that file's connections lit even after
      // the mouse moves away — matches the natural "I clicked this; show me
      // its world" mental model.
      // (`focusedNodeId` is hoisted above the rfNodes memo for the
      //  descendant-set computation; reused here.)
      // "Edge focused" — this edge's source or target IS the focused node.
      // Used by crossRefOpacityFor / crossRefInteractionWidthFor /
      // focusedCrossRefStrokeFor to decide whether THIS edge lights up.
      const isFocused =
        focusedNodeId !== null &&
        (e.source === focusedNodeId || e.target === focusedNodeId);
      // "Anything focused" — ANY node in the graph is focused. Drives
      // hierarchy backbone dim-on-focus: the spine recedes whenever the
      // user is investigating, regardless of whether THIS hierarchy edge
      // touches the focused node.
      const anythingFocused = focusedNodeId !== null;
      const isHierarchyKind = e.kind === "d-aggregate";
      // Subtree-hierarchy override (user feedback 2026-04-22, "hover folder
      // → light up subtree"): when the focused node is a folder cluster in
      // flat mode, hierarchy edges that connect nodes WITHIN that subtree
      // pop back to full opacity. This is the visual cue that says "these
      // tiles belong to me" — paired with the descendant rings on the tiles
      // themselves it makes "which file is under which folder" obvious even
      // when sibling folders are expanded side-by-side. `subtreeIds` is the
      // empty set when no folder is focused, so the test naturally falls
      // back to the regular hierarchyOpacityFor dim path.
      const isHierarchyInSubtree =
        isHierarchyKind &&
        focusedFolderId !== null &&
        subtreeIds.has(e.source) &&
        subtreeIds.has(e.target);
      // Hierarchy edges dim to 0.4 when something is focused (backbone
      // recedes behind the lit cross-refs). Cross-ref edges dim to 0.15 by
      // default and light to full opacity when their endpoint is focused.
      // The `isFlatMode` arg is now a legacy positional slot — both helpers
      // ignore it and behave uniformly across all modes.
      const opacity = isHierarchyKind
        ? isHierarchyInSubtree
          ? 1
          : hierarchyOpacityFor(isFlatMode, anythingFocused)
        : crossRefOpacityFor(e.kind, isFlatMode, isFocused, anythingFocused);
      // Hit-target width must shrink in lockstep with the visible opacity
      // (user QA 2026-04-22): React Flow's invisible 20px-wide
      // `react-flow__edge-interaction` overlay was eating pointer events for
      // cross-ref edges that were dimmed to 0.15 — making it impossible to
      // hover the file behind a faint edge. The focus+context fix worked
      // visually but quietly broke the hover affordance it was designed to
      // restore. Mirror crossRefOpacityFor's exemptions here so an edge that
      // can't dim never loses its hit-zone.
      const interactionWidth = crossRefInteractionWidthFor(
        e.kind,
        isFlatMode,
        isFocused,
      );
      // Focus-revealed per-kind palette (Option D, 2026-04-22): in flat
      // modes, cross-ref edges paint amber by default and switch to their
      // EDGE_KIND_META color when their endpoint is focused. Cluster mode
      // already paints per-kind via `edgeStyleFor` above, so the helper is
      // a no-op there (it returns the same per-kind color either way).
      // Unresolved edges keep their red `style.stroke` from treeEdgeStyleFor
      // / edgeStyleFor — the helper override only applies when resolved.
      const stroke = e.unresolved
        ? style.stroke
        : focusedCrossRefStrokeFor(e.kind, isFlatMode, isFocused);
      // Bezier curves for cross-ref edges in BOTH cluster and flat modes:
      //
      //  - Flat modes (dendrogram, tree, Change 2 — 2026-04-22): the
      //    smoothstep orthogonal routing inherited from elkjs's mrtree was
      //    the visual culprit behind images #13/#14 — straight horizontal/
      //    vertical segments through sibling rows. Bezier curves arc away
      //    from the tree's main axes and naturally avoid passing through
      //    node bodies. Hierarchy edges (`d-aggregate`) keep smoothstep so
      //    the tree backbone stays crisp and rectilinear.
      //
      //  - Cluster mode (Bug #2 fix, 2026-04-22 — image #17): straight
      //    smoothstep edges at scale (the user's ~2,250-file Coder
      //    codebase) crisscrossed every cluster box and made the canvas
      //    unreadable. Bezier curves arc around obstacles and dramatically
      //    reduce the "line slicing through unrelated tile" problem. Plus
      //    the soft focus dim (`crossRefOpacityFor`'s `anythingFocused`
      //    branch) lets the user push unrelated edges back when
      //    investigating a single node. d-aggregate edges in cluster mode
      //    are vanishingly rare (containment carries the relationship), so
      //    the same `kind !== "d-aggregate"` guard is a near-no-op there.
      const useBezier = e.kind !== "d-aggregate";
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        type: useBezier ? "default" : "smoothstep",
        zIndex: 1000,
        interactionWidth,
        style: {
          ...style,
          stroke,
          strokeWidth: isAggregated
            ? Math.min(6, 1.5 + Math.log2(e.count))
            : style.strokeWidth,
          opacity,
          ...(isHierarchyInFlatMode ? { pointerEvents: "none" as const } : {}),
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          // Arrowhead inherits the per-kind focused color in lockstep with
          // the path stroke — so a focused include edge shows a blue arrow,
          // not an amber one.
          color: stroke,
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
  }, [
    layout,
    selectedFileId,
    // `hoveredNodeId` deliberately excluded — `focusedNodeId =
    // hoveredNodeId ?? selectedFileId` already participates in the deps
    // and changes whenever hover changes, so listing both would re-trigger
    // the memo twice on a hover transition.
    focusedNodeId,
    focusedFolderId,
    subtreeIds,
    isFlatMode,
  ]);

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
          //
          // Selection ALWAYS updates so the focus-revealed cross-ref palette
          // + selection ring keep working regardless of the panel toggle.
          // The detail panel only opens when `autoOpenDetailPanel` is true
          // (default). Users who flip the toolbar setting off can click
          // tiles purely to scan/trace edges without losing right-side
          // real estate to the panel.
          if (node.type === "file" || node.type === "treeFile") {
            selectFile(node.id);
            if (autoOpenDetailPanel) openDetailPanel();
          }
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

