import { describe, it, expect } from "vitest";
import { computeClusterLayout } from "./cluster-layout";
import type { Graph } from "./types";

/**
 * Build a synthetic 3-cluster × 4-file graph. ClusterNode entries reflect
 * the crawler v2 contract: cluster paths, childFiles, childClusters.
 */
function makeFixture(): Graph {
  const clusters = [
    {
      path: "a",
      parent: null,
      childFiles: ["af0", "af1", "af2", "af3"],
      childClusters: [],
      kind: "folder" as const,
    },
    {
      path: "b",
      parent: null,
      childFiles: ["bf0", "bf1", "bf2", "bf3"],
      childClusters: [],
      kind: "folder" as const,
    },
    {
      path: "c",
      parent: null,
      childFiles: ["cf0", "cf1", "cf2", "cf3"],
      childClusters: [],
      kind: "folder" as const,
    },
  ];
  const mkFile = (id: string, folder: string) => ({
    id,
    path: `${folder}/${id}.xml`,
    name: `${id}.xml`,
    folder,
    kind: "xml" as const,
    sizeBytes: 100,
    params: [],
    parseError: null,
    isTest: false,
  });
  const files = [
    mkFile("af0", "a"),
    mkFile("af1", "a"),
    mkFile("af2", "a"),
    mkFile("af3", "a"),
    mkFile("bf0", "b"),
    mkFile("bf1", "b"),
    mkFile("bf2", "b"),
    mkFile("bf3", "b"),
    mkFile("cf0", "c"),
    mkFile("cf1", "c"),
    mkFile("cf2", "c"),
    mkFile("cf3", "c"),
  ];
  const edges = [
    {
      source: "af0",
      target: "bf0",
      kind: "include" as const,
      unresolved: null,
    },
    {
      source: "bf1",
      target: "cf1",
      kind: "ref" as const,
      unresolved: null,
    },
  ];
  return {
    version: 2,
    root: "fixture",
    files,
    edges,
    clusters,
  };
}

describe("computeClusterLayout", () => {
  const fixture = makeFixture();

  it("returns only collapsed cluster nodes when expanded set is empty", () => {
    const laid = computeClusterLayout(fixture, new Set());
    // No clusters are expanded → all children are virtualized away.
    expect(laid.nodes.filter((n) => n.kind === "cluster").length).toBe(3);
    expect(laid.nodes.filter((n) => n.kind === "file").length).toBe(0);
  });

  it("returns 3 clusters + 4 children when one cluster is expanded", () => {
    const laid = computeClusterLayout(fixture, new Set(["a"]));
    expect(laid.nodes.filter((n) => n.kind === "cluster").length).toBe(3);
    expect(laid.nodes.filter((n) => n.kind === "file").length).toBe(4);
  });

  it("returns 3 clusters + 12 files when all are expanded", () => {
    const laid = computeClusterLayout(
      fixture,
      new Set(["a", "b", "c"]),
    );
    expect(laid.nodes.filter((n) => n.kind === "cluster").length).toBe(3);
    expect(laid.nodes.filter((n) => n.kind === "file").length).toBe(12);
  });

  it("assigns parent ids on file nodes matching cluster path", () => {
    const laid = computeClusterLayout(fixture, new Set(["a"]));
    const files = laid.nodes.filter((n) => n.kind === "file");
    for (const f of files) {
      expect(f.parent).toBe("a");
    }
  });

  it("emits edges between endpoints that are visible", () => {
    // Only 'a' expanded → edge bf1→cf1 has neither endpoint visible as a file,
    // but both endpoints' clusters are visible → edge retargeted to clusters.
    const laid = computeClusterLayout(fixture, new Set(["a"]));
    const edgeIds = laid.edges.map((e) => `${e.source}->${e.target}`);
    expect(edgeIds).toContain("b->c"); // aggregated across cluster endpoints
  });

  it("preserves in-cluster edges when both endpoints expanded", () => {
    const laid = computeClusterLayout(
      fixture,
      new Set(["a", "b", "c"]),
    );
    const edgeIds = laid.edges.map((e) => `${e.source}->${e.target}`);
    expect(edgeIds).toContain("af0->bf0");
    expect(edgeIds).toContain("bf1->cf1");
  });
});
