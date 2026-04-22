import type { Graph, FileKind } from "@/lib/graph/types";

/**
 * v2 filter state. `folder` is retained on FilterState for backward compat
 * with TableView / FolderView (list views) where scoping by folder still
 * makes UX sense. The GRAPH view treats folder as NAVIGATE (see
 * FilterBar.tsx onFolderChange + GraphCanvas passing folder:null to
 * applyFilters).
 */
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
 *
 * Folder behavior:
 *  - When `folder` is null (GraphCanvas call site in v2) → no folder scoping.
 *  - When `folder` is non-null (TableView/FolderView) → files outside that
 *    folder (or its descendants) are stripped from the returned Graph. Graph
 *    view no longer calls this with a folder — that's V.7 NAVIGATE.
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
