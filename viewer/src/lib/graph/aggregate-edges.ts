/**
 * Edge aggregation — pure function for combining multiple inter-cluster edges
 * into a single visual edge with count + kind-breakdown.
 *
 * The cluster-layout.ts module already retargets file-level edges to their
 * owning clusters when endpoints are virtualized out; this module exposes a
 * standalone helper so tests (and the EdgeStyles renderer) can reason about
 * aggregation independently of layout.
 *
 * Precedence for dominant-kind (visual color, V.8):
 *   include > ref > import > xsd > logical-id > d-aggregate
 */
import type { Edge, EdgeKind } from "./types";

export interface AggregatedEdge {
  source: string;
  target: string;
  /** Dominant kind — drives color. */
  kind: EdgeKind;
  count: number;
  kindBreakdown: Partial<Record<EdgeKind, number>>;
  /** First-seen unresolved string (if any). */
  unresolved: string | null;
}

const KIND_PRECEDENCE: EdgeKind[] = [
  "include",
  "ref",
  "import",
  "xsd",
  "logical-id",
  "d-aggregate",
];

function pickDominantKind(
  breakdown: Partial<Record<EdgeKind, number>>,
): EdgeKind {
  for (const k of KIND_PRECEDENCE) {
    if ((breakdown[k] ?? 0) > 0) return k;
  }
  return "include";
}

/**
 * Aggregate edges by (source, target). Edges with null target are ignored —
 * the caller renders those separately (dangling/unresolved).
 */
export function aggregateEdges(edges: Edge[]): AggregatedEdge[] {
  const buckets = new Map<string, AggregatedEdge>();
  for (const e of edges) {
    if (e.target === null) continue;
    const key = `${e.source}->${e.target}`;
    let b = buckets.get(key);
    if (!b) {
      b = {
        source: e.source,
        target: e.target,
        kind: e.kind,
        count: 0,
        kindBreakdown: {},
        unresolved: e.unresolved,
      };
      buckets.set(key, b);
    }
    b.count += 1;
    b.kindBreakdown[e.kind] = (b.kindBreakdown[e.kind] ?? 0) + 1;
  }
  // Finalize dominant kind + stable ordering.
  return Array.from(buckets.values())
    .map((b) => ({ ...b, kind: pickDominantKind(b.kindBreakdown) }))
    .sort((a, b) => {
      if (a.source !== b.source) return a.source.localeCompare(b.source);
      return a.target.localeCompare(b.target);
    });
}
