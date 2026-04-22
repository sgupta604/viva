import type { EdgeKind } from "@/lib/graph/types";

export interface EdgeStyleSpec {
  stroke: string;
  strokeDasharray?: string;
  strokeWidth: number;
}

/**
 * Single source of truth for per-kind edge styling AND legend rendering.
 *
 * Both `edgeStyleFor()` (used by GraphCanvas to color React Flow edges) and
 * `EdgeLegend.tsx` (the always-visible chrome chip) read from this array, so
 * a new edge kind cannot drift between renderer and legend. When a new kind
 * is added to `EdgeKind` in `lib/graph/types.ts`, TypeScript will surface the
 * missing entry here at compile time.
 *
 * `label` is the human-facing name shown in the legend chip and used as the
 * default React Flow edge label when the edge is not aggregated.
 */
export interface EdgeKindMeta {
  kind: EdgeKind;
  color: string;
  /** Optional dasharray for differentiating xsd from import at a glance. */
  dasharray?: string;
  /** Default stroke width (visually weights structural < semantic edges). */
  strokeWidth: number;
  /** Human-readable label for the legend chip. */
  label: string;
}

export const EDGE_KIND_META: readonly EdgeKindMeta[] = [
  { kind: "include", color: "#60a5fa", strokeWidth: 1.5, label: "include" },
  { kind: "ref", color: "#fbbf24", strokeWidth: 1.5, label: "ref" },
  { kind: "import", color: "#34d399", strokeWidth: 1.5, label: "import" },
  {
    kind: "xsd",
    color: "#4ade80",
    strokeWidth: 1.5,
    dasharray: "6 3",
    label: "xsd",
  },
  {
    kind: "d-aggregate",
    color: "#9ca3af",
    strokeWidth: 1,
    label: "d-aggregate",
  },
  { kind: "logical-id", color: "#f59e0b", strokeWidth: 1.5, label: "logical-id" },
] as const;

/** Unresolved edges of any kind keep the red-dashed error treatment. */
export const UNRESOLVED_EDGE_STYLE: EdgeStyleSpec = {
  stroke: "#ef4444",
  strokeDasharray: "4 3",
  strokeWidth: 1.5,
};

/**
 * Tree-mode 2-color palette (user feedback 2026-04-22).
 *
 * The default tree view became unreadable with 6 colors competing on every
 * line — the user said it was "unusable... hard to tell apart." So in tree
 * mode we collapse to two semantic buckets:
 *
 *   - HIERARCHY (`d-aggregate`): structural parent-file ↔ `.d/` drop-in
 *     containment. Same role as the box-nesting that React Flow already
 *     draws via `parentNode`, just for the .d-style relationship that
 *     doesn't fit the cluster model. Rendered in a low-contrast slate so
 *     it recedes against the dark canvas.
 *
 *   - CROSS-REFERENCE (everything else: include / ref / import / xsd /
 *     logical-id): semantic links between configs. Soft cyan — distinct
 *     from hierarchy, present without shouting.
 *
 * Cluster mode keeps the full `EDGE_KIND_META` palette because the user
 * said the multi-color legend is fine in the dense info-rich cluster view.
 */
export const TREE_HIERARCHY_COLOR = "#475569"; // slate-600 — recedes
export const TREE_CROSSREF_COLOR = "#7dd3fc"; // sky-300 — soft accent

const HIERARCHY_KINDS: ReadonlySet<EdgeKind> = new Set<EdgeKind>([
  "d-aggregate",
]);

/**
 * Bucket an edge kind into the tree-mode two-color scheme.
 * Pure helper — exported for tests and the legend chip.
 */
export function treeEdgeBucket(kind: EdgeKind): "hierarchy" | "crossref" {
  return HIERARCHY_KINDS.has(kind) ? "hierarchy" : "crossref";
}

export function treeEdgeColor(kind: EdgeKind): string {
  return treeEdgeBucket(kind) === "hierarchy"
    ? TREE_HIERARCHY_COLOR
    : TREE_CROSSREF_COLOR;
}

/**
 * Tree-mode counterpart to `edgeStyleFor`. Unresolved still wins (red dashed
 * stays a hard error signal). Otherwise the kind is bucketed to the 2-color
 * scheme; `d-aggregate` keeps its thin (1px) weight so structural lines
 * stay visually subordinate to cross-references.
 */
export function treeEdgeStyleFor(
  kind: EdgeKind,
  unresolved: boolean,
): EdgeStyleSpec {
  if (unresolved) {
    return { ...UNRESOLVED_EDGE_STYLE };
  }
  const bucket = treeEdgeBucket(kind);
  return {
    stroke: bucket === "hierarchy" ? TREE_HIERARCHY_COLOR : TREE_CROSSREF_COLOR,
    strokeWidth: bucket === "hierarchy" ? 1 : 1.5,
  };
}

/**
 * Should this edge swallow pointer events? In flat modes (dendrogram/tree)
 * the `d-aggregate` hierarchy edges are decorative backbone — they draw
 * the spine of the tree but are not user-interactive. Without this guard
 * they sit above tree-folder cards (zIndex 1000 vs the React Flow node
 * default) and intercept Playwright's strict-actionability click — which
 * was the root cause of the dendrogram-layout E2E "expand round-trip"
 * failure. Cross-ref edges (include/import/ref/xsd/logical-id) stay
 * clickable in every mode; cluster mode keeps hierarchy edges clickable
 * because cluster boxes ARE legitimate edge endpoints in that view.
 *
 * Pure helper, exported for the GraphCanvas edge mapper AND for tests
 * that lock the invariant.
 */
export function shouldDisablePointerEvents(
  kind: EdgeKind,
  isFlatMode: boolean,
): boolean {
  return isFlatMode && kind === "d-aggregate";
}

/**
 * Focus + context dimming for cross-reference edges in flat (dendrogram/tree)
 * modes. User feedback 2026-04-22: in dense flat layouts, cross-ref edges
 * criss-cross sibling nodes and the eye can't trace which connects to what.
 *
 * Default state (no focus): cross-ref edges render at 0.15 opacity so the
 * dendrogram structure reads cleanly and references recede into a faint
 * lattice of "there are connections here, hover to investigate."
 *
 * Focused state (hover OR selection on either endpoint): cross-ref edges
 * touching the focused node return to full opacity so the user can trace
 * what THIS node references and is referenced by.
 *
 * Hierarchy (`d-aggregate`) edges always render full opacity — they're the
 * tree's backbone, dimming them would break the visual structure.
 *
 * Cluster mode is intentionally untouched (caller passes `isFlatMode=false`)
 * because the user explicitly values cluster mode as the dense info-rich
 * alternative; dimming there would erase information they want.
 *
 * Pure helper — same `(kind, isFlatMode, isFocused)` always returns the same
 * opacity. Exported for the GraphCanvas edge mapper AND for tests.
 */
export const CROSSREF_DIM_OPACITY = 0.15;
export const CROSSREF_FULL_OPACITY = 1;

export function crossRefOpacityFor(
  kind: EdgeKind,
  isFlatMode: boolean,
  isFocused: boolean,
): number {
  // Cluster mode: never dim. Hierarchy edges in any mode: never dim — the
  // tree backbone needs to stay visible.
  if (!isFlatMode) return CROSSREF_FULL_OPACITY;
  if (kind === "d-aggregate") return CROSSREF_FULL_OPACITY;
  return isFocused ? CROSSREF_FULL_OPACITY : CROSSREF_DIM_OPACITY;
}

/**
 * 2-row legend metadata for tree mode. Keeps the same `EdgeKindMeta` shape
 * the legend already iterates over (label + color + strokeWidth), so the
 * EdgeLegend component can switch arrays without restructuring its JSX.
 *
 * `kind` is repurposed as a bucket key here ("hierarchy" / "reference") —
 * it's only used for `data-testid="edge-legend-item-${kind}"` and to track
 * which row is which; it does NOT have to match an `EdgeKind` value because
 * tree mode never reads it back as an edge kind.
 */
export interface TreeLegendRow {
  bucket: "hierarchy" | "reference";
  color: string;
  strokeWidth: number;
  label: string;
}

export const TREE_LEGEND_ROWS: readonly TreeLegendRow[] = [
  {
    bucket: "hierarchy",
    color: TREE_HIERARCHY_COLOR,
    strokeWidth: 1,
    label: "hierarchy",
  },
  {
    bucket: "reference",
    color: TREE_CROSSREF_COLOR,
    strokeWidth: 1.5,
    label: "reference",
  },
] as const;

const META_BY_KIND: Record<EdgeKind, EdgeKindMeta> = EDGE_KIND_META.reduce(
  (acc, m) => {
    acc[m.kind] = m;
    return acc;
  },
  {} as Record<EdgeKind, EdgeKindMeta>,
);

/**
 * Per-kind edge styling. v1 kinds (include/ref/import) unchanged; v2 adds:
 *   - xsd          → dashed green
 *   - d-aggregate  → subtle gray (structural, not conceptual)
 *   - logical-id   → solid amber
 *
 * Unresolved edges of any kind keep the red-dashed error treatment.
 */
export function edgeStyleFor(kind: EdgeKind, unresolved: boolean): EdgeStyleSpec {
  if (unresolved) {
    return { ...UNRESOLVED_EDGE_STYLE };
  }
  const meta = META_BY_KIND[kind];
  if (!meta) {
    // Defensive fallback — should be unreachable because EdgeKind is closed.
    return { stroke: "#6b7280", strokeWidth: 1.5 };
  }
  const spec: EdgeStyleSpec = { stroke: meta.color, strokeWidth: meta.strokeWidth };
  if (meta.dasharray) spec.strokeDasharray = meta.dasharray;
  return spec;
}
