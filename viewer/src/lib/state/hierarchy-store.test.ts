/**
 * V.1 — hierarchyStore tests.
 *
 * Covers expand / collapse / expandToPath / collapseAll / isExpanded /
 * expandedSet, plus sessionStorage persistence.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  HIERARCHY_STORAGE_KEY,
  useHierarchyStore,
} from "./hierarchy-store";

const RESET = () => {
  useHierarchyStore.getState().collapseAll();
};

describe("hierarchyStore", () => {
  beforeEach(() => {
    // Each test starts with a clean slate.
    RESET();
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.removeItem(HIERARCHY_STORAGE_KEY);
    }
  });

  afterEach(() => {
    RESET();
  });

  it("expand(path) adds to the expanded set", () => {
    useHierarchyStore.getState().expand("a/b");
    expect(useHierarchyStore.getState().isExpanded("a/b")).toBe(true);
    expect(useHierarchyStore.getState().expandedSet().has("a/b")).toBe(true);
  });

  it("collapse(path) removes from the expanded set", () => {
    useHierarchyStore.getState().expand("a/b");
    useHierarchyStore.getState().collapse("a/b");
    expect(useHierarchyStore.getState().isExpanded("a/b")).toBe(false);
  });

  it("expandToPath('a/b/c') adds a, a/b, a/b/c", () => {
    useHierarchyStore.getState().expandToPath("a/b/c");
    const set = useHierarchyStore.getState().expandedSet();
    expect(set.has("a")).toBe(true);
    expect(set.has("a/b")).toBe(true);
    expect(set.has("a/b/c")).toBe(true);
  });

  it("collapseAll() empties the set", () => {
    useHierarchyStore.getState().expand("a");
    useHierarchyStore.getState().expand("b/c");
    useHierarchyStore.getState().collapseAll();
    expect(useHierarchyStore.getState().expandedSet().size).toBe(0);
  });

  it("expanding a path already expanded is idempotent", () => {
    useHierarchyStore.getState().expand("a");
    useHierarchyStore.getState().expand("a");
    expect(useHierarchyStore.getState().expandedSet().size).toBe(1);
  });

  it("collapsing a path not expanded is a no-op", () => {
    useHierarchyStore.getState().collapse("not-expanded");
    expect(useHierarchyStore.getState().expandedSet().size).toBe(0);
  });

  it("no cross-imports from other stores (DECISIONS.md boundary)", async () => {
    // Static import-text check: make sure hierarchy-store.ts does NOT pull in
    // filter-store / graph-store / view-store / selection-store. This is a
    // soft guard — a real build would surface the violation, but it's nice
    // to have a fast, programmatic assertion.
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "hierarchy-store.ts"),
      "utf-8",
    );
    expect(src).not.toMatch(/from ["']\.\/filter-store["']/);
    expect(src).not.toMatch(/from ["']\.\/graph-store["']/);
    expect(src).not.toMatch(/from ["']\.\/view-store["']/);
    expect(src).not.toMatch(/from ["']\.\/selection-store["']/);
  });
});
