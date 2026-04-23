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
 * v3 — graph-mode-only sub-toggle: which layout drives the graph canvas.
 *
 * Three options after the dendrogram continuation (2026-04-22):
 *   - `dendrogram` — flat folder/file labels with drawn orthogonal hierarchy
 *     edges (matches the user's reference image). NEW DEFAULT.
 *   - `tree`       — original v3 mrtree-on-cluster-containment-boxes layout.
 *     Kept for layout-comparison value on real codebases.
 *   - `clusters`   — recursive box-in-box compound nodes. Original v2 layout.
 *
 * Persisted under a versioned localStorage key so a future schema change can
 * rev the suffix without colliding with stored values from old shapes.
 *
 * Migration: existing `tree` / `clusters` values stored from prior sessions
 * still rehydrate (the read guard accepts all three values). Only NEW users
 * with no stored value get the `dendrogram` default — that respects an
 * existing user's deliberate choice while making dendrogram the
 * out-of-the-box experience.
 */
export type GraphLayout = "dendrogram" | "tree" | "clusters";

const GRAPH_LAYOUT_STORAGE_KEY = "viva.viewStore.graphLayout";
const LEGEND_COLLAPSED_STORAGE_KEY = "viva.viewStore.legendCollapsed";
const AUTO_OPEN_DETAIL_PANEL_STORAGE_KEY =
  "viva.viewStore.autoOpenDetailPanel";

/**
 * SSR / private-window safe localStorage read. Returns undefined when storage
 * is unavailable; caller falls back to default.
 */
function readGraphLayout(): GraphLayout | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.localStorage.getItem(GRAPH_LAYOUT_STORAGE_KEY);
    // Accept all three valid values. `tree` and `clusters` keep working for
    // users who already chose them in a prior session — we don't migrate.
    if (raw === "dendrogram" || raw === "tree" || raw === "clusters") return raw;
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

/**
 * `autoOpenDetailPanel` controls whether clicking a file tile in the graph
 * canvas force-opens the FileDetailPanel. Default `true` preserves the
 * historical behavior; users who flip it off can click tiles purely to
 * select/highlight them (drives the focus-revealed cross-ref palette and
 * selection ring) WITHOUT the panel popping in. When OFF, the panel can
 * still be opened via the search palette / explicit action — only the
 * implicit click-to-open is suppressed.
 */
function readAutoOpenDetailPanel(): boolean | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.localStorage.getItem(AUTO_OPEN_DETAIL_PANEL_STORAGE_KEY);
    if (raw === "true") return true;
    if (raw === "false") return false;
  } catch {
    // ignore
  }
  return undefined;
}

function writeAutoOpenDetailPanel(value: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      AUTO_OPEN_DETAIL_PANEL_STORAGE_KEY,
      value ? "true" : "false",
    );
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
  /**
   * When true (default), clicking a file tile in the graph canvas force-opens
   * the FileDetailPanel. When false, clicking only updates selection state
   * (selection ring + focus-revealed cross-ref palette stay) but the panel
   * does NOT pop in. Useful for scanning/tracing edges without losing
   * right-side real estate.
   */
  autoOpenDetailPanel: boolean;
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
  /** Toggle the auto-open-on-click behavior for the detail panel. Persists. */
  setAutoOpenDetailPanel: (value: boolean) => void;
}

export const useViewStore = create<ViewState>((set, get) => ({
  viewMode: "graph",
  sortBy: "path",
  sortDir: "asc",
  // New-user default flipped from `tree` → `dendrogram` (2026-04-22). Stored
  // values for `tree` / `clusters` still rehydrate above.
  graphLayout: readGraphLayout() ?? "dendrogram",
  legendCollapsed: readLegendCollapsed() ?? false,
  autoOpenDetailPanel: readAutoOpenDetailPanel() ?? true,
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
  setAutoOpenDetailPanel: (value) => {
    writeAutoOpenDetailPanel(value);
    set({ autoOpenDetailPanel: value });
  },
}));

// Exported for tests + future consumers that want to reset persistence.
export const __VIEW_STORE_INTERNALS = {
  GRAPH_LAYOUT_STORAGE_KEY,
  LEGEND_COLLAPSED_STORAGE_KEY,
  AUTO_OPEN_DETAIL_PANEL_STORAGE_KEY,
};
