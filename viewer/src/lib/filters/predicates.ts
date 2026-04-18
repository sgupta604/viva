import type { Graph, FileKind } from "@/lib/graph/types";

export interface FilterState {
  kinds: Set<FileKind>;
  hideTests: boolean;
  folder: string | null;
  searchQuery: string;
}

/**
 * Pure filter function. Returns a new Graph containing only the files matching
 * the filter criteria; edges are kept only when both endpoints are visible (or
 * when the edge is unresolved and its source is visible).
 */
export function applyFilters(graph: Graph, state: FilterState): Graph {
  const q = state.searchQuery.trim().toLowerCase();
  const files = graph.files.filter((f) => {
    if (!state.kinds.has(f.kind)) return false;
    if (state.hideTests && f.isTest) return false;
    if (state.folder && !(f.folder === state.folder || f.folder.startsWith(state.folder + "/"))) {
      return false;
    }
    if (q) {
      const hay = `${f.path}\n${f.name}\n${f.params.map((p) => p.key).join("\n")}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  const visibleIds = new Set(files.map((f) => f.id));
  const edges = graph.edges.filter((e) => {
    if (!visibleIds.has(e.source)) return false;
    if (e.target === null) return true; // unresolved: keep, render as dangling
    return visibleIds.has(e.target);
  });
  return { ...graph, files, edges };
}
