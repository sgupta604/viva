import type { EdgeKind } from "@/lib/graph/types";

export interface EdgeStyleSpec {
  stroke: string;
  strokeDasharray?: string;
  strokeWidth: number;
}

export function edgeStyleFor(kind: EdgeKind, unresolved: boolean): EdgeStyleSpec {
  const base: EdgeStyleSpec = { stroke: "#6b7280", strokeWidth: 1.5 };
  if (unresolved) {
    return { ...base, stroke: "#ef4444", strokeDasharray: "4 3" };
  }
  if (kind === "include") return { ...base, stroke: "#60a5fa" };
  if (kind === "ref") return { ...base, stroke: "#fbbf24" };
  if (kind === "import") return { ...base, stroke: "#34d399" };
  return base;
}
