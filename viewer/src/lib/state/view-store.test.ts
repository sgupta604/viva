import { describe, it, expect, beforeEach } from "vitest";
import { useViewStore } from "./view-store";

describe("view store", () => {
  beforeEach(() => {
    // Fresh defaults between tests.
    useViewStore.setState({
      viewMode: "graph",
      sortBy: "path",
      sortDir: "asc",
    });
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
});
