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

/**
 * Nested fixture: top-level `root` has no direct files, only sub-clusters.
 * One sub-cluster (`root/inner`) has 2 files. Another sub-cluster
 * (`root/deep`) has a sub-sub-cluster `root/deep/leaf` with 1 file.
 *
 * This mirrors the viva-on-viva case (crawler has no childFiles, only
 * childClusters) — before the fix, expanding `root` showed an empty tile.
 */
function makeNestedFixture(): Graph {
  const clusters = [
    {
      path: "root",
      parent: null,
      childFiles: [],
      childClusters: ["root/inner", "root/deep"],
      kind: "folder" as const,
    },
    {
      path: "root/inner",
      parent: "root",
      childFiles: ["if0", "if1"],
      childClusters: [],
      kind: "folder" as const,
    },
    {
      path: "root/deep",
      parent: "root",
      childFiles: [],
      childClusters: ["root/deep/leaf"],
      kind: "folder" as const,
    },
    {
      path: "root/deep/leaf",
      parent: "root/deep",
      childFiles: ["lf0"],
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
    mkFile("if0", "root/inner"),
    mkFile("if1", "root/inner"),
    mkFile("lf0", "root/deep/leaf"),
  ];
  // Intra-top-cluster edges — all under `root`. Exercises Bug 3: they must
  // survive as real edges (not self-loops) when the nested cluster is visible.
  const edges = [
    { source: "if0", target: "lf0", kind: "include" as const, unresolved: null },
    { source: "if0", target: "if1", kind: "ref" as const, unresolved: null },
  ];
  return { version: 2, root: "nested", files, edges, clusters };
}

describe("computeClusterLayout — nested clusters (Bug 1)", () => {
  it("expanded cluster with ONLY sub-clusters emits those sub-clusters as nodes", () => {
    // Before fix: laid.nodes for `root` had only the `root` cluster itself.
    // After fix: when `root` is expanded, `root/inner` and `root/deep` are
    // emitted as additional cluster nodes.
    const fx = makeNestedFixture();
    const laid = computeClusterLayout(fx, new Set(["root"]));
    const clusterIds = laid.nodes.filter((n) => n.kind === "cluster").map((n) => n.id);
    expect(clusterIds).toContain("root");
    expect(clusterIds).toContain("root/inner");
    expect(clusterIds).toContain("root/deep");
  });

  it("sub-clusters have correct parentNode wiring", () => {
    const fx = makeNestedFixture();
    const laid = computeClusterLayout(fx, new Set(["root"]));
    const inner = laid.nodes.find((n) => n.id === "root/inner");
    const deep = laid.nodes.find((n) => n.id === "root/deep");
    expect(inner?.parent).toBe("root");
    expect(deep?.parent).toBe("root");
    // Sub-clusters default to collapsed → no grandchildren emitted yet.
    expect(laid.nodes.find((n) => n.id === "if0")).toBeUndefined();
  });

  it("expanding a nested cluster recursively reveals its children", () => {
    const fx = makeNestedFixture();
    const laid = computeClusterLayout(
      fx,
      new Set(["root", "root/inner"]),
    );
    // root/inner's two files should now be visible file nodes.
    const fileIds = laid.nodes.filter((n) => n.kind === "file").map((n) => n.id);
    expect(fileIds).toContain("if0");
    expect(fileIds).toContain("if1");
    // Their parent should be root/inner (for React Flow compound node).
    for (const fid of ["if0", "if1"]) {
      const n = laid.nodes.find((x) => x.id === fid);
      expect(n?.parent).toBe("root/inner");
    }
  });

  it("descends 3 levels when each ancestor is expanded", () => {
    const fx = makeNestedFixture();
    const laid = computeClusterLayout(
      fx,
      new Set(["root", "root/deep", "root/deep/leaf"]),
    );
    const clusterIds = laid.nodes.filter((n) => n.kind === "cluster").map((n) => n.id);
    expect(clusterIds).toContain("root/deep/leaf");
    const leaf = laid.nodes.find((n) => n.id === "lf0");
    expect(leaf).toBeDefined();
    expect(leaf?.parent).toBe("root/deep/leaf");
  });

  it("edges retarget to nearest visible ancestor, not to top cluster (Bug 3)", () => {
    // if0 → lf0. When only `root` and `root/inner` are expanded, if0 is a
    // visible file, but lf0 is buried — its nearest visible ancestor should
    // be `root/deep` (collapsed). Old behavior rolled to `root` → self-loop
    // if we'd ever had that shape. Here we assert the retarget resolves to
    // `root/deep`, producing a real cross-cluster edge.
    const fx = makeNestedFixture();
    const laid = computeClusterLayout(
      fx,
      new Set(["root", "root/inner"]),
    );
    const pairs = laid.edges.map((e) => `${e.source}->${e.target}`);
    expect(pairs).toContain("if0->root/deep");
  });

  it("edges fully survive at 3-deep expansion with file-level endpoints", () => {
    const fx = makeNestedFixture();
    const laid = computeClusterLayout(
      fx,
      new Set(["root", "root/inner", "root/deep", "root/deep/leaf"]),
    );
    const pairs = laid.edges.map((e) => `${e.source}->${e.target}`);
    expect(pairs).toContain("if0->lf0");
    expect(pairs).toContain("if0->if1");
  });

  it("zero edges drop to self-loop when everything rolls up to the same top (regression for viva self-crawl)", () => {
    // All edges are intra-root. When ONLY `root` is expanded and both
    // sub-clusters are collapsed, edges retarget to `root/inner` and
    // `root/deep` — two different visible nodes, so they render.
    const fx = makeNestedFixture();
    const laid = computeClusterLayout(fx, new Set(["root"]));
    expect(laid.edges.length).toBeGreaterThan(0);
  });
});
