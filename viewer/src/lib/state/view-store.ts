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

/**
 * v3 — graph-mode-only sub-toggle: dendrogram vs. cluster-box layout.
 * Default `"tree"` (research §Goal: tree as default; clusters as opt-in).
 * Persisted under a versioned localStorage key so a future schema change
 * can rev the suffix without colliding with stored values from old shapes.
 */
export type GraphLayout = "tree" | "clusters";

const GRAPH_LAYOUT_STORAGE_KEY = "viva.viewStore.graphLayout";
const LEGEND_COLLAPSED_STORAGE_KEY = "viva.viewStore.legendCollapsed";

/**
 * SSR / private-window safe localStorage read. Returns undefined when storage
 * is unavailable; caller falls back to default.
 */
function readGraphLayout(): GraphLayout | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.localStorage.getItem(GRAPH_LAYOUT_STORAGE_KEY);
    if (raw === "tree" || raw === "clusters") return raw;
  } catch {
    // localStorage may throw in strict private modes — silently fall back.
  }
  return undefined;
}

function writeGraphLayout(value: GraphLayout): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(GRAPH_LAYOUT_STORAGE_KEY, value);
  } catch {
    // Quota / private-mode failures are non-fatal — UI still reflects the
    // requested value via the in-memory store.
  }
}

function readLegendCollapsed(): boolean | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.localStorage.getItem(LEGEND_COLLAPSED_STORAGE_KEY);
    if (raw === "true") return true;
    if (raw === "false") return false;
  } catch {
    // ignore
  }
  return undefined;
}

function writeLegendCollapsed(value: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LEGEND_COLLAPSED_STORAGE_KEY, value ? "true" : "false");
  } catch {
    // ignore
  }
}

interface ViewState {
  viewMode: ViewMode;
  sortBy: SortBy;
  sortDir: SortDir;
  graphLayout: GraphLayout;
  legendCollapsed: boolean;
  setViewMode: (m: ViewMode) => void;
  /**
   * Sort by `by`. If `dir` is omitted: clicking the current column toggles
   * asc<->desc, clicking a new column resets to asc.
   */
  setSort: (by: SortBy, dir?: SortDir) => void;
  /** Swap the graph-mode layout. Persists to localStorage on every call. */
  setGraphLayout: (layout: GraphLayout) => void;
  /** Toggle / set the EdgeLegend collapse state. Persists to localStorage. */
  setLegendCollapsed: (collapsed: boolean) => void;
}

export const useViewStore = create<ViewState>((set, get) => ({
  viewMode: "graph",
  sortBy: "path",
  sortDir: "asc",
  graphLayout: readGraphLayout() ?? "tree",
  legendCollapsed: readLegendCollapsed() ?? false,
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
  setGraphLayout: (layout) => {
    writeGraphLayout(layout);
    set({ graphLayout: layout });
  },
  setLegendCollapsed: (collapsed) => {
    writeLegendCollapsed(collapsed);
    set({ legendCollapsed: collapsed });
  },
}));

// Exported for tests + future consumers that want to reset persistence.
export const __VIEW_STORE_INTERNALS = {
  GRAPH_LAYOUT_STORAGE_KEY,
  LEGEND_COLLAPSED_STORAGE_KEY,
};
