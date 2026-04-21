/**
 * View store — "how am I looking at this?" state for the live graph.
 *
 * Lives on the liveGraph side of the DECISIONS.md Zustand-modular-stores
 * wall. Explicitly does NOT import from filter-store or selection-store;
 * consumers compose the three at the component level. See
 * .claude/docs/DECISIONS.md (2026-04-20) for why view/filter/selection are
 * separate slices rather than one flat store.
 */
import { create } from "zustand";

export type ViewMode = "graph" | "folders" | "table";
export type SortBy = "name" | "path" | "size" | "refCount" | "parseStatus";
export type SortDir = "asc" | "desc";

interface ViewState {
  viewMode: ViewMode;
  sortBy: SortBy;
  sortDir: SortDir;
  setViewMode: (m: ViewMode) => void;
  /**
   * Sort by `by`. If `dir` is omitted: clicking the current column toggles
   * asc<->desc, clicking a new column resets to asc.
   */
  setSort: (by: SortBy, dir?: SortDir) => void;
}

export const useViewStore = create<ViewState>((set, get) => ({
  viewMode: "graph",
  sortBy: "path",
  sortDir: "asc",
  setViewMode: (m) => set({ viewMode: m }),
  setSort: (by, dir) => {
    if (dir) {
      set({ sortBy: by, sortDir: dir });
      return;
    }
    const current = get();
    if (current.sortBy === by) {
      set({ sortDir: current.sortDir === "asc" ? "desc" : "asc" });
    } else {
      set({ sortBy: by, sortDir: "asc" });
    }
  },
}));
