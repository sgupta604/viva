import type { Graph } from "@/lib/graph/types";

export interface HighlightResult {
  /** Files that are edge-connected (kind=ref) to a file that declares paramKey. */
  edgeResolved: Set<string>;
  /** Files that declare paramKey but are not edge-connected. */
  nameMatch: Set<string>;
}

/**
 * Compute the strong/muted highlight sets for a given param key.
 *
 * - **edgeResolved** — files where an incoming edge of kind `ref` points at a
 *   file that declares `paramKey`.
 * - **nameMatch** — files declaring `paramKey` that are not edge-connected.
 */
export function highlightsFor(paramKey: string, graph: Graph): HighlightResult {
  const declarers = new Set<string>();
  for (const f of graph.files) {
    if (f.params.some((p) => p.key === paramKey)) declarers.add(f.id);
  }
  const edgeResolved = new Set<string>();
  for (const e of graph.edges) {
    if (e.kind !== "ref") continue;
    if (e.target && declarers.has(e.target)) {
      edgeResolved.add(e.source);
      edgeResolved.add(e.target);
    }
  }
  const nameMatch = new Set<string>();
  for (const id of declarers) if (!edgeResolved.has(id)) nameMatch.add(id);
  return { edgeResolved, nameMatch };
}
