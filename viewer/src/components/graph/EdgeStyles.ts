import type { EdgeKind } from "@/lib/graph/types";

export interface EdgeStyleSpec {
  stroke: string;
  strokeDasharray?: string;
  strokeWidth: number;
}

/**
 * Per-kind edge styling. v1 kinds (include/ref/import) unchanged; v2 adds:
 *   - xsd          → dashed green
 *   - d-aggregate  → subtle gray (structural, not conceptual)
 *   - logical-id   → solid amber
 *
 * Unresolved edges of any kind keep the red-dashed error treatment.
 */
export function edgeStyleFor(kind: EdgeKind, unresolved: boolean): EdgeStyleSpec {
  const base: EdgeStyleSpec = { stroke: "#6b7280", strokeWidth: 1.5 };
  if (unresolved) {
    return { ...base, stroke: "#ef4444", strokeDasharray: "4 3" };
  }
  if (kind === "include") return { ...base, stroke: "#60a5fa" };
  if (kind === "ref") return { ...base, stroke: "#fbbf24" };
  if (kind === "import") return { ...base, stroke: "#34d399" };
  // v2 kinds
  if (kind === "xsd") return { ...base, stroke: "#4ade80", strokeDasharray: "6 3" };
  if (kind === "d-aggregate")
    return { ...base, stroke: "#9ca3af", strokeWidth: 1 };
  if (kind === "logical-id") return { ...base, stroke: "#f59e0b" };
  return base;
}
