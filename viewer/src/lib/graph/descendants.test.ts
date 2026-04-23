import { describe, it, expect } from "vitest";
import { getDescendantIds, isFolderId } from "./descendants";
import type { Graph, ClusterNode, FileNode } from "./types";

/**
 * Build a small nested-folder fixture:
 *
 *   root
 *   ├── a            (3 direct files: a/x, a/y, a/z)
 *   │   └── a/sub    (2 direct files: a/sub/p, a/sub/q)
 *   ├── b            (1 direct file: b/r)
 *   └── c            (empty folder, no children)
 */
function makeFixture(): Graph {
  const clusters: ClusterNode[] = [
    {
      path: "a",
      parent: null,
      childFiles: ["a/x", "a/y", "a/z"],
      childClusters: ["a/sub"],
      kind: "folder",
    },
    {
      path: "a/sub",
      parent: "a",
      childFiles: ["a/sub/p", "a/sub/q"],
      childClusters: [],
      kind: "folder",
    },
    {
      path: "b",
      parent: null,
      childFiles: ["b/r"],
      childClusters: [],
      kind: "folder",
    },
    {
      path: "c",
      parent: null,
      childFiles: [],
      childClusters: [],
      kind: "folder",
    },
  ];
  const mkFile = (id: string, folder: string): FileNode => ({
    id,
    path: id,
    name: id.split("/").pop() ?? id,
    folder,
    kind: "xml",
    sizeBytes: 100,
    params: [],
    parseError: null,
    isTest: false,
  });
  return {
    version: 2,
    root: ".",
    files: [
      mkFile("a/x", "a"),
      mkFile("a/y", "a"),
      mkFile("a/z", "a"),
      mkFile("a/sub/p", "a/sub"),
      mkFile("a/sub/q", "a/sub"),
      mkFile("b/r", "b"),
    ],
    edges: [],
    clusters,
  };
}

describe("getDescendantIds", () => {
  it("returns the folder id plus every descendant cluster + file", () => {
    const g = makeFixture();
    const ids = getDescendantIds("a", g);
    // INCLUSIVE of the folder itself, plus its files, the nested cluster,
    // and the nested cluster's files.
    expect(ids).toEqual(
      new Set(["a", "a/x", "a/y", "a/z", "a/sub", "a/sub/p", "a/sub/q"]),
    );
  });

  it("returns just the folder + its direct files when there are no sub-clusters", () => {
    const g = makeFixture();
    const ids = getDescendantIds("b", g);
    expect(ids).toEqual(new Set(["b", "b/r"]));
  });

  it("returns just the folder when it has no children at all", () => {
    const g = makeFixture();
    const ids = getDescendantIds("c", g);
    expect(ids).toEqual(new Set(["c"]));
  });

  it("returns just the folder when called on the deepest cluster", () => {
    const g = makeFixture();
    const ids = getDescendantIds("a/sub", g);
    expect(ids).toEqual(new Set(["a/sub", "a/sub/p", "a/sub/q"]));
  });

  it("does NOT include sibling folders' children", () => {
    const g = makeFixture();
    const ids = getDescendantIds("a", g);
    // sibling `b`/`c` and their files must stay out.
    expect(ids.has("b")).toBe(false);
    expect(ids.has("b/r")).toBe(false);
    expect(ids.has("c")).toBe(false);
  });

  it("returns an empty set for a null folderId", () => {
    const g = makeFixture();
    expect(getDescendantIds(null, g)).toEqual(new Set());
    expect(getDescendantIds("", g)).toEqual(new Set());
  });

  it("returns an empty set when the id is not a known cluster (e.g. a file id)", () => {
    const g = makeFixture();
    // file ids are NOT cluster paths — caller falls back to single-node focus.
    expect(getDescendantIds("a/x", g)).toEqual(new Set());
    expect(getDescendantIds("does-not-exist", g)).toEqual(new Set());
  });

  it("returns an empty set when the graph is null", () => {
    expect(getDescendantIds("a", null)).toEqual(new Set());
  });

  it("returns an empty set when the graph has no clusters", () => {
    const g: Graph = { version: 2, root: ".", files: [], edges: [], clusters: [] };
    expect(getDescendantIds("a", g)).toEqual(new Set());
  });

  it("survives a malformed graph with a cluster cycle (defensive)", () => {
    // Crawler emits a strict tree but a hand-edited graph.json shouldn't
    // crash the UI. Cycle: a -> b -> a.
    const clusters: ClusterNode[] = [
      {
        path: "a",
        parent: null,
        childFiles: ["a/x"],
        childClusters: ["b"],
        kind: "folder",
      },
      {
        path: "b",
        parent: "a",
        childFiles: ["b/y"],
        childClusters: ["a"], // cycle back to a
        kind: "folder",
      },
    ];
    const g: Graph = {
      version: 2,
      root: ".",
      files: [],
      edges: [],
      clusters,
    };
    const ids = getDescendantIds("a", g);
    // Both clusters + both files included exactly once; no infinite loop.
    expect(ids).toEqual(new Set(["a", "a/x", "b", "b/y"]));
  });
});

describe("isFolderId", () => {
  it("returns true for a known cluster path", () => {
    const g = makeFixture();
    expect(isFolderId("a", g)).toBe(true);
    expect(isFolderId("a/sub", g)).toBe(true);
  });

  it("returns false for a file id", () => {
    const g = makeFixture();
    expect(isFolderId("a/x", g)).toBe(false);
  });

  it("returns false for null / empty / unknown / null-graph", () => {
    const g = makeFixture();
    expect(isFolderId(null, g)).toBe(false);
    expect(isFolderId("", g)).toBe(false);
    expect(isFolderId("nope", g)).toBe(false);
    expect(isFolderId("a", null)).toBe(false);
  });
});
