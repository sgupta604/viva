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
