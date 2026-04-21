/**
 * Pure sort function over FileNode[] for the non-graph view modes.
 *
 * `edges` is needed to compute the `refCount` sort key once (outgoing edges
 * per source file). All other keys derive from the FileNode itself.
 *
 * Does NOT mutate the input; returns a new array. Uses Array.prototype.sort
 * (stable in modern JS) with explicit tuple comparisons so ties preserve
 * input order.
 */
import type { Edge, FileNode } from "@/lib/graph/types";
import type { SortBy, SortDir } from "@/lib/state/view-store";

export function sortFiles(
  files: FileNode[],
  edges: Edge[],
  by: SortBy,
  dir: SortDir,
): FileNode[] {
  // Build outgoing-edge counts once, not once per comparison.
  const refCount = new Map<string, number>();
  if (by === "refCount") {
    for (const e of edges) {
      refCount.set(e.source, (refCount.get(e.source) ?? 0) + 1);
    }
  }

  const key = (f: FileNode): number | string => {
    switch (by) {
      case "name":
        return f.name;
      case "path":
        return f.path;
      case "size":
        return f.sizeBytes;
      case "refCount":
        return refCount.get(f.id) ?? 0;
      case "parseStatus":
        // errors sort last on asc (0 = clean, 1 = error)
        return f.parseError ? 1 : 0;
    }
  };

  const mult = dir === "asc" ? 1 : -1;
  // Copy then sort — never mutate input.
  return [...files].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (ka < kb) return -1 * mult;
    if (ka > kb) return 1 * mult;
    return 0;
  });
}
