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
 *     logical-id): semantic links between configs. Warm amber — distinct
 *     from the cool slate hierarchy, present without shouting.
 *
 * Color choice (user QA 2026-04-22, Bug #2 follow-up): the previous
 * sky-300 cross-ref accent (`#7dd3fc`) sat in the same blue family as
 * slate-600 hierarchy and was hard to disambiguate at the trunk where
 * cyan cross-refs overlay the slate backbone. Amber-400 (`#fbbf24`) gives
 * the strongest cool-vs-warm contrast against slate, matches the existing
 * cluster-mode `logical-id ×N` chip color (small palette consistency win),
 * and the focus+context "glow" pops more brightly as amber than as light
 * blue.
 *
 * Cluster mode keeps the full `EDGE_KIND_META` palette because the user
 * said the multi-color legend is fine in the dense info-rich cluster view.
 */
export const TREE_HIERARCHY_COLOR = "#475569"; // slate-600 — recedes
export const TREE_CROSSREF_COLOR = "#fbbf24"; // amber-400 — warm accent vs slate

const HIERARCHY_KINDS: ReadonlySet<EdgeKind> = new Set<EdgeKind>([
  "d-aggregate",
]);

/**
 * Indexed lookup over `EDGE_KIND_META` so per-kind helpers (`edgeStyleFor`,
 * `focusedCrossRefStrokeFor`) can resolve a kind → meta in O(1) instead of
 * scanning the array. Declared up here so any helper below can reference it
 * without a temporal dead-zone surprise.
 */
const META_BY_KIND: Record<EdgeKind, EdgeKindMeta> = EDGE_KIND_META.reduce(
  (acc, m) => {
    acc[m.kind] = m;
    return acc;
  },
  {} as Record<EdgeKind, EdgeKindMeta>,
);

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
/**
 * Cluster-mode "soft dim" for non-focused cross-ref edges. Bug #2 (image #17,
 * 2026-04-22): cluster mode at scale (the user's ~2,250-file Coder codebase)
 * showed straight smoothstep edges criss-crossing every cluster box — the
 * canvas became an unreadable grid of orthogonal lines. The visual fix is
 * twofold:
 *
 *  1. **Bezier curves for cluster-mode cross-refs** (GraphCanvas change) —
 *     curves arc around obstacles instead of slicing through them.
 *  2. **Soft focus dim** (this constant) — when ANY node is hovered or
 *     selected, NON-touching cross-ref edges fade to ~35% opacity. The
 *     cluster-mode info-density the user explicitly praised stays present
 *     in the default state (no node focused = every edge full color), but
 *     the user can investigate by hovering/selecting and the focused
 *     subgraph pops out of the lattice.
 *
 * Why 0.35 (vs the 0.15 flat-mode dim): cluster mode keeps the full per-kind
 * palette and aggregated `×N` chips. A 0.15 dim would make those chips
 * unreadable and erase the per-kind color information the user values.
 * 0.35 is enough to push unrelated edges visually behind the focused ones
 * while preserving the chip + per-kind color cues at-a-glance.
 */
export const CROSSREF_CLUSTER_SOFT_DIM_OPACITY = 0.35;

export function crossRefOpacityFor(
  kind: EdgeKind,
  isFlatMode: boolean,
  isFocused: boolean,
  /**
   * "Anything focused" — true when ANY node in the graph is currently
   * hovered or selected. Drives cluster-mode soft dimming: cluster-mode
   * edges only dim when the user IS investigating something.
   *
   * Optional for backward-compat: callers (and tests) that don't pass it
   * default to `false`, which preserves the pre-Bug-#2 cluster behavior
   * (always full opacity).
   */
  anythingFocused: boolean = false,
): number {
  // Hierarchy edges in any mode: never dim — the tree backbone needs to
  // stay visible.
  if (kind === "d-aggregate") return CROSSREF_FULL_OPACITY;
  // Flat modes (dendrogram / tree): hard 0.15 dim by default, full when
  // this edge's endpoint is focused.
  if (isFlatMode) {
    return isFocused ? CROSSREF_FULL_OPACITY : CROSSREF_DIM_OPACITY;
  }
  // Cluster mode: soft 0.35 dim ONLY when something else is focused. With
  // nothing focused, every edge stays full opacity — the dense info-rich
  // default the user praised. With a node focused, edges touching that
  // node stay full and others recede so the focused subgraph pops out.
  if (anythingFocused && !isFocused) return CROSSREF_CLUSTER_SOFT_DIM_OPACITY;
  return CROSSREF_FULL_OPACITY;
}

/**
 * Hit-target width for an edge's invisible interaction layer (React Flow's
 * `interactionWidth` prop — defaults to 20px). When a cross-ref edge is
 * dimmed to 0.15 opacity in a flat layout, its visible stroke is barely
 * perceptible but the 20px-wide interaction overlay still intercepts every
 * pointer event passing through it. That broke node-hover the user expects:
 * trying to hover a file behind a faint edge silently failed because the
 * edge's hit-zone ate the move.
 *
 * Fix: when the edge is dimmed, drop its interaction width to 0. The visible
 * path stays drawn (so the dim hint of "there's a connection here" persists),
 * but it stops swallowing pointer events. The moment the edge is focused
 * (hover/select on either endpoint) it returns to the default 20px hit-zone
 * so the user can click the now-bright edge to inspect it.
 *
 * Cluster mode and hierarchy edges are unaffected — they never dim in the
 * first place, so their hit-target stays at the React Flow default.
 *
 * Pure helper, exported for the GraphCanvas edge mapper AND for tests.
 */
export const CROSSREF_INTERACTION_WIDTH_FOCUSED = 20;
export const CROSSREF_INTERACTION_WIDTH_DIMMED = 0;

export function crossRefInteractionWidthFor(
  kind: EdgeKind,
  isFlatMode: boolean,
  isFocused: boolean,
): number {
  // Mirror crossRefOpacityFor's exemption rules so the two stay in lockstep:
  // an edge that doesn't dim must keep its hit-zone, otherwise we'd silently
  // make permanently-bright edges unclickable.
  //
  // Cluster-mode soft dim (0.35, Bug #2) deliberately KEEPS the hit-zone
  // open. The edge is still very visible at 0.35 opacity (vs the 0.15 hard
  // dim in flat modes that genuinely fades to a hint), so a click on it is
  // still a meaningful user action — pulling the hit-zone away there would
  // make focused-state navigation harder, not easier.
  if (!isFlatMode) return CROSSREF_INTERACTION_WIDTH_FOCUSED;
  if (kind === "d-aggregate") return CROSSREF_INTERACTION_WIDTH_FOCUSED;
  return isFocused
    ? CROSSREF_INTERACTION_WIDTH_FOCUSED
    : CROSSREF_INTERACTION_WIDTH_DIMMED;
}

/**
 * Focus-revealed per-kind palette for cross-reference edges in flat
 * (dendrogram/tree) modes. User feedback 2026-04-22 (Option D from research):
 * the default amber-everywhere palette stays calm, but when a node is
 * focused the LIT cross-ref edges switch from amber to their per-kind color
 * from `EDGE_KIND_META` so the user can see WHICH kind each connection is.
 *
 * Default state (no focus): cross-ref edges render amber (`TREE_CROSSREF_COLOR`)
 * — the calm dim-amber lattice the user praised.
 *
 * Focused state (hover OR selection on either endpoint): cross-ref edges
 * touching the focused node render at their per-kind color from
 * `EDGE_KIND_META` (include blue / import green / xsd green-dashed etc.).
 *
 * Cluster mode is unchanged — it already paints every cross-ref with its
 * per-kind color all the time. The helper short-circuits to
 * `EDGE_KIND_META[kind].color` so callers can use it uniformly.
 *
 * Hierarchy (`d-aggregate`) edges always return `TREE_HIERARCHY_COLOR` in
 * flat mode (the slate backbone) and the hierarchy meta color in cluster
 * mode — they're never re-themed by focus because they're structural, not
 * semantic.
 *
 * Mirrors the `(kind, isFlatMode, isFocused)` shape of `crossRefOpacityFor`
 * + `crossRefInteractionWidthFor` so the three helpers stay in lockstep.
 */
export function focusedCrossRefStrokeFor(
  kind: EdgeKind,
  isFlatMode: boolean,
  isFocused: boolean,
): string {
  // Cluster mode: always per-kind color (existing behavior).
  if (!isFlatMode) {
    return META_BY_KIND[kind]?.color ?? TREE_CROSSREF_COLOR;
  }
  // Flat mode hierarchy: always the slate backbone color.
  if (kind === "d-aggregate") return TREE_HIERARCHY_COLOR;
  // Flat-mode cross-ref: per-kind color when focused, amber otherwise.
  if (isFocused) {
    return META_BY_KIND[kind]?.color ?? TREE_CROSSREF_COLOR;
  }
  return TREE_CROSSREF_COLOR;
}

/**
 * Hierarchy backbone dim-on-focus (Bug #4 fix, 2026-04-22). User feedback:
 * when a node is hovered or selected in flat mode, the lit cross-refs need
 * to own the foreground. The full-opacity slate hierarchy backbone competes
 * for attention even though it's already a low-contrast color; dropping it
 * to ~40% opacity keeps the tree spine visible as context but lets the
 * focused per-kind cross-refs pop.
 *
 * Default state (no focus): hierarchy renders at full opacity — the
 * backbone is the primary structure cue and must read clearly.
 *
 * Focused state (any node hovered or selected in flat mode): hierarchy
 * dims to 0.4 — visible enough to ground the focused subgraph in the tree's
 * structure, faint enough to recede behind the lit cross-refs.
 *
 * Cluster mode: hierarchy is expressed via containment, not edges, so the
 * helper short-circuits to full opacity — cluster-mode `d-aggregate` edges
 * (when present) keep their normal weight.
 *
 * Mirrors the `(isFlatMode, isFocused)` shape of the cross-ref helpers
 * for the lockstep guard. Note this helper takes only the two flag args
 * since hierarchy dimming is per-mode, not per-kind — it's only ever
 * applied to `d-aggregate` edges by the caller.
 */
export const HIERARCHY_DIM_OPACITY = 0.4;
export const HIERARCHY_FULL_OPACITY = 1;

export function hierarchyOpacityFor(
  isFlatMode: boolean,
  isFocused: boolean,
): number {
  // Cluster mode never dims hierarchy — and cluster mode rarely renders
  // d-aggregate edges anyway since containment carries the relationship.
  if (!isFlatMode) return HIERARCHY_FULL_OPACITY;
  return isFocused ? HIERARCHY_DIM_OPACITY : HIERARCHY_FULL_OPACITY;
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
