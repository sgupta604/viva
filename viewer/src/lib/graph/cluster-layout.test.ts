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

/**
 * Heterogeneous-width sibling packing — regression fixture for BLOCKER 1
 * discovered in the post-fix visual verify. When cluster `a` has one EXPANDED
 * sub-cluster `a/wide` (which itself contains many collapsed grand-children,
 * making it much wider than a single tile) and several COLLAPSED siblings
 * `a/narrow0`, `a/narrow1`, `a/narrow2`, packing the siblings in a row using a
 * constant per-cell stride caused the collapsed siblings to land inside the
 * bounding box of `a/wide` — pixel overlap in the UI.
 *
 * Expected: siblings placed AFTER `a/wide` in the same row must have x-coords
 * ≥ (a/wide.x + a/wide.width), i.e. no horizontal overlap with the expanded
 * sibling's full measured rectangle.
 */
function makeHeterogeneousSiblingFixture(): Graph {
  const clusters = [
    {
      path: "a",
      parent: null,
      childFiles: [],
      childClusters: [
        "a/wide",
        "a/narrow0",
        "a/narrow1",
        "a/narrow2",
      ],
      kind: "folder" as const,
    },
    {
      path: "a/wide",
      parent: "a",
      childFiles: [],
      // Seven grand-children, all collapsed — this forces a/wide's interior
      // grid to wrap across multiple rows (SUBCLUSTERS_PER_ROW=3) and makes
      // a/wide substantially wider than COLLAPSED_CLUSTER_W.
      childClusters: [
        "a/wide/g0",
        "a/wide/g1",
        "a/wide/g2",
        "a/wide/g3",
        "a/wide/g4",
        "a/wide/g5",
        "a/wide/g6",
      ],
      kind: "folder" as const,
    },
    ...["g0", "g1", "g2", "g3", "g4", "g5", "g6"].map((g) => ({
      path: `a/wide/${g}`,
      parent: "a/wide",
      childFiles: [`${g}f`],
      childClusters: [],
      kind: "folder" as const,
    })),
    ...["narrow0", "narrow1", "narrow2"].map((n) => ({
      path: `a/${n}`,
      parent: "a",
      childFiles: [`${n}f`],
      childClusters: [],
      kind: "folder" as const,
    })),
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
    ...["g0", "g1", "g2", "g3", "g4", "g5", "g6"].map((g) =>
      mkFile(`${g}f`, `a/wide/${g}`),
    ),
    ...["narrow0", "narrow1", "narrow2"].map((n) =>
      mkFile(`${n}f`, `a/${n}`),
    ),
  ];
  return { version: 2, root: "hetero", files, edges: [], clusters };
}

describe("computeClusterLayout — heterogeneous sibling packing (BLOCKER 1)", () => {
  it("collapsed siblings do not horizontally overlap an expanded sibling's rect", () => {
    const fx = makeHeterogeneousSiblingFixture();
    // `a` and `a/wide` expanded; the three `a/narrowN` siblings stay collapsed.
    const laid = computeClusterLayout(fx, new Set(["a", "a/wide"]));

    const wide = laid.nodes.find((n) => n.id === "a/wide");
    expect(wide).toBeDefined();
    const narrows = ["a/narrow0", "a/narrow1", "a/narrow2"]
      .map((id) => laid.nodes.find((n) => n.id === id))
      .filter((n): n is NonNullable<typeof n> => !!n);
    expect(narrows.length).toBe(3);

    // All narrows are siblings of wide (parent === "a") and must be positioned
    // outside wide's bounding box. Per-sibling x-coords are relative to `a`,
    // so we compare against wide's own relative x + width.
    for (const n of narrows) {
      const horizontallyClear = n.x >= wide!.x + wide!.width;
      const verticallyClear =
        n.y >= wide!.y + wide!.height || n.y + n.height <= wide!.y;
      expect(
        horizontallyClear || verticallyClear,
        `sibling ${n.id} at (${n.x},${n.y} ${n.width}x${n.height}) overlaps wide rect (${wide!.x},${wide!.y} ${wide!.width}x${wide!.height})`,
      ).toBe(true);
    }
  });

  it("parent cluster container is wide enough to contain its expanded child", () => {
    const fx = makeHeterogeneousSiblingFixture();
    const laid = computeClusterLayout(fx, new Set(["a", "a/wide"]));
    const a = laid.nodes.find((n) => n.id === "a");
    const wide = laid.nodes.find((n) => n.id === "a/wide");
    expect(a).toBeDefined();
    expect(wide).toBeDefined();
    // wide's coords are relative to a; a's width must accommodate wide's
    // full extent plus padding (descendants can't spill past a's right edge).
    expect(a!.width).toBeGreaterThanOrEqual(wide!.x + wide!.width);
  });
});

/**
 * BLOCKER 2 regression: the badge on a collapsed cluster must show the TOTAL
 * number of files in its subtree (all descendants), not just its direct
 * childFiles. Pre-fix: `crawler` has childFiles=[] but 40+ files in descendant
 * fixtures → badge read "0".
 */
function makeDescendantCountFixture(): Graph {
  const clusters = [
    {
      path: "r",
      parent: null,
      childFiles: ["r-direct"],
      childClusters: ["r/a", "r/b"],
      kind: "folder" as const,
    },
    {
      path: "r/a",
      parent: "r",
      childFiles: ["a-f0", "a-f1"],
      childClusters: ["r/a/deep"],
      kind: "folder" as const,
    },
    {
      path: "r/a/deep",
      parent: "r/a",
      childFiles: ["deep-f0", "deep-f1", "deep-f2"],
      childClusters: [],
      kind: "folder" as const,
    },
    {
      path: "r/b",
      parent: "r",
      childFiles: [], // intentionally empty — direct count 0, descendant ≠ 0
      childClusters: ["r/b/leaf"],
      kind: "folder" as const,
    },
    {
      path: "r/b/leaf",
      parent: "r/b",
      childFiles: ["leaf-f0", "leaf-f1", "leaf-f2", "leaf-f3"],
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
    mkFile("r-direct", "r"),
    mkFile("a-f0", "r/a"),
    mkFile("a-f1", "r/a"),
    mkFile("deep-f0", "r/a/deep"),
    mkFile("deep-f1", "r/a/deep"),
    mkFile("deep-f2", "r/a/deep"),
    mkFile("leaf-f0", "r/b/leaf"),
    mkFile("leaf-f1", "r/b/leaf"),
    mkFile("leaf-f2", "r/b/leaf"),
    mkFile("leaf-f3", "r/b/leaf"),
  ];
  return { version: 2, root: "counts", files, edges: [], clusters };
}

describe("computeClusterLayout — totalDescendantFiles (BLOCKER 2)", () => {
  it("root aggregates every file in its subtree", () => {
    const laid = computeClusterLayout(makeDescendantCountFixture(), new Set());
    const r = laid.nodes.find((n) => n.id === "r");
    expect(r).toBeDefined();
    // 1 direct + 2 under r/a + 3 under r/a/deep + 0 under r/b + 4 under r/b/leaf
    expect(r!.totalDescendantFiles).toBe(10);
  });

  it("intermediate cluster with own direct files + deeper files aggregates both", () => {
    const laid = computeClusterLayout(
      makeDescendantCountFixture(),
      new Set(["r"]),
    );
    const a = laid.nodes.find((n) => n.id === "r/a");
    expect(a).toBeDefined();
    // 2 direct + 3 under r/a/deep
    expect(a!.totalDescendantFiles).toBe(5);
  });

  it("childFiles-empty cluster still reports descendant total (NOT 0)", () => {
    const laid = computeClusterLayout(
      makeDescendantCountFixture(),
      new Set(["r"]),
    );
    const b = laid.nodes.find((n) => n.id === "r/b");
    expect(b).toBeDefined();
    // 0 direct + 4 under r/b/leaf — the viva-on-viva regression signature.
    expect(b!.totalDescendantFiles).toBe(4);
  });

  it("leaf cluster's total equals its direct file count", () => {
    const laid = computeClusterLayout(
      makeDescendantCountFixture(),
      new Set(["r", "r/b"]),
    );
    const leaf = laid.nodes.find((n) => n.id === "r/b/leaf");
    expect(leaf).toBeDefined();
    expect(leaf!.totalDescendantFiles).toBe(4);
  });
});

/**
 * polish-batch-1 item 1 — collapsed-cluster intra-edge badge.
 *
 * Today, edges between two files inside the same collapsed cluster get
 * silently dropped at the `src === tgt` branch in `retargetEdges` (after both
 * endpoints retarget to the same cluster id). The badge surfaces that count
 * so a user can tell at a glance whether collapsing a cluster hides activity.
 */
function makeIntraClusterEdgeFixture(): Graph {
  const clusters = [
    {
      path: "alpha",
      parent: null,
      childFiles: ["a0", "a1", "a2"],
      childClusters: [],
      kind: "folder" as const,
    },
    {
      path: "beta",
      parent: null,
      childFiles: ["b0", "b1"],
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
    mkFile("a0", "alpha"),
    mkFile("a1", "alpha"),
    mkFile("a2", "alpha"),
    mkFile("b0", "beta"),
    mkFile("b1", "beta"),
  ];
  // alpha has 2 intra-cluster edges (a0→a1, a1→a2) and 1 cross-cluster (a0→b0).
  // beta has 0 intra-cluster edges.
  const edges = [
    { source: "a0", target: "a1", kind: "include" as const, unresolved: null },
    { source: "a1", target: "a2", kind: "ref" as const, unresolved: null },
    { source: "a0", target: "b0", kind: "include" as const, unresolved: null },
  ];
  return { version: 2, root: "intra", files, edges, clusters };
}

describe("computeClusterLayout — intraClusterEdgeCount (polish-batch-1 item 1)", () => {
  it("counts edges that drop as self-loops on a collapsed cluster", () => {
    const laid = computeClusterLayout(makeIntraClusterEdgeFixture(), new Set());
    const alpha = laid.nodes.find((n) => n.id === "alpha");
    expect(alpha).toBeDefined();
    // a0→a1 + a1→a2 = 2 intra-cluster drops. a0→b0 stays a real edge.
    expect(alpha!.intraClusterEdgeCount).toBe(2);
  });

  it("cluster with no intra-cluster edges has count 0 or undefined", () => {
    const laid = computeClusterLayout(makeIntraClusterEdgeFixture(), new Set());
    const beta = laid.nodes.find((n) => n.id === "beta");
    expect(beta).toBeDefined();
    // Either omitted or explicitly 0 — both are acceptable; ClusterNode hides
    // the badge in either case.
    expect(beta!.intraClusterEdgeCount ?? 0).toBe(0);
  });

  it("expanded cluster does not accumulate intra-cluster drops (edges become visible)", () => {
    // When alpha is expanded, a0/a1/a2 are real visible nodes; the edges
    // between them are real edges, not self-loops. Count should be 0.
    const laid = computeClusterLayout(
      makeIntraClusterEdgeFixture(),
      new Set(["alpha"]),
    );
    const alpha = laid.nodes.find((n) => n.id === "alpha");
    expect(alpha).toBeDefined();
    expect(alpha!.intraClusterEdgeCount ?? 0).toBe(0);
  });
});
