import { describe, it, expect, beforeEach } from "vitest";
import { useViewStore, __VIEW_STORE_INTERNALS } from "./view-store";

const { GRAPH_LAYOUT_STORAGE_KEY, LEGEND_COLLAPSED_STORAGE_KEY } =
  __VIEW_STORE_INTERNALS;

describe("view store", () => {
  beforeEach(() => {
    // Fresh defaults between tests. Note we DO NOT touch graphLayout default
    // here — the per-test cases that care about persistence reset it
    // explicitly via setGraphLayout so the localStorage write path runs.
    useViewStore.setState({
      viewMode: "graph",
      sortBy: "path",
      sortDir: "asc",
      graphLayout: "tree",
      legendCollapsed: false,
    });
    window.localStorage.removeItem(GRAPH_LAYOUT_STORAGE_KEY);
    window.localStorage.removeItem(LEGEND_COLLAPSED_STORAGE_KEY);
  });

  it("defaults viewMode to graph", () => {
    expect(useViewStore.getState().viewMode).toBe("graph");
  });

  it("defaults sortBy to path and sortDir to asc", () => {
    const s = useViewStore.getState();
    expect(s.sortBy).toBe("path");
    expect(s.sortDir).toBe("asc");
  });

  it("setViewMode updates the mode", () => {
    useViewStore.getState().setViewMode("folders");
    expect(useViewStore.getState().viewMode).toBe("folders");
    useViewStore.getState().setViewMode("table");
    expect(useViewStore.getState().viewMode).toBe("table");
  });

  it("setSort with a new column resets direction to asc", () => {
    useViewStore.setState({ sortBy: "size", sortDir: "desc" });
    useViewStore.getState().setSort("name");
    const s = useViewStore.getState();
    expect(s.sortBy).toBe("name");
    expect(s.sortDir).toBe("asc");
  });

  it("setSort with the current column toggles direction", () => {
    // start asc
    useViewStore.setState({ sortBy: "size", sortDir: "asc" });
    useViewStore.getState().setSort("size");
    expect(useViewStore.getState().sortDir).toBe("desc");
    useViewStore.getState().setSort("size");
    expect(useViewStore.getState().sortDir).toBe("asc");
  });

  it("setSort accepts an explicit direction override", () => {
    useViewStore.getState().setSort("refCount", "desc");
    const s = useViewStore.getState();
    expect(s.sortBy).toBe("refCount");
    expect(s.sortDir).toBe("desc");
  });

  // ------------------------------------------------------------------
  // graphLayout (v3 — tree-layout-redesign)
  // ------------------------------------------------------------------

  it("defaults graphLayout to tree", () => {
    expect(useViewStore.getState().graphLayout).toBe("tree");
  });

  it("setGraphLayout updates the layout and writes through to localStorage", () => {
    useViewStore.getState().setGraphLayout("clusters");
    expect(useViewStore.getState().graphLayout).toBe("clusters");
    expect(window.localStorage.getItem(GRAPH_LAYOUT_STORAGE_KEY)).toBe("clusters");

    useViewStore.getState().setGraphLayout("tree");
    expect(useViewStore.getState().graphLayout).toBe("tree");
    expect(window.localStorage.getItem(GRAPH_LAYOUT_STORAGE_KEY)).toBe("tree");
  });

  it("rehydrates graphLayout from localStorage on store init", async () => {
    // Simulate a stored value, then re-import the module to trigger a fresh
    // create() call. We use vi.resetModules so the lazy module is re-evaluated.
    window.localStorage.setItem(GRAPH_LAYOUT_STORAGE_KEY, "clusters");
    const { vi } = await import("vitest");
    vi.resetModules();
    const fresh = await import("./view-store");
    expect(fresh.useViewStore.getState().graphLayout).toBe("clusters");
  });

  it("ignores invalid localStorage values and falls back to tree", async () => {
    window.localStorage.setItem(GRAPH_LAYOUT_STORAGE_KEY, "garbage");
    const { vi } = await import("vitest");
    vi.resetModules();
    const fresh = await import("./view-store");
    expect(fresh.useViewStore.getState().graphLayout).toBe("tree");
  });

  // ------------------------------------------------------------------
  // legendCollapsed (v3 — EdgeLegend persistence)
  // ------------------------------------------------------------------

  it("defaults legendCollapsed to false (legend visible)", () => {
    expect(useViewStore.getState().legendCollapsed).toBe(false);
  });

  it("setLegendCollapsed persists through localStorage", () => {
    useViewStore.getState().setLegendCollapsed(true);
    expect(useViewStore.getState().legendCollapsed).toBe(true);
    expect(window.localStorage.getItem(LEGEND_COLLAPSED_STORAGE_KEY)).toBe("true");

    useViewStore.getState().setLegendCollapsed(false);
    expect(window.localStorage.getItem(LEGEND_COLLAPSED_STORAGE_KEY)).toBe("false");
  });
});
