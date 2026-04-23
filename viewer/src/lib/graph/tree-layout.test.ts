import { describe, it, expect, beforeEach } from "vitest";
import { computeTreeLayout } from "./tree-layout";
import { __clearLayoutCache } from "./layout.worker";
import type { Graph } from "./types";

function mkFile(id: string, folder: string) {
  return {
    id,
    path: `${folder}/${id}.xml`,
    name: `${id}.xml`,
    folder,
    kind: "xml" as const,
    sizeBytes: 100,
    params: [],
    parseError: null,
    isTest: false,
  };
}

function smallGraph(): Graph {
  return {
    version: 2,
    root: ".",
    files: [
      mkFile("af0", "a"),
      mkFile("af1", "a"),
      mkFile("bf0", "b"),
      mkFile("bf1", "b"),
    ],
    edges: [
      { source: "af0", target: "bf0", kind: "include", unresolved: null },
      { source: "af1", target: "bf1", kind: "ref", unresolved: null },
    ],
    clusters: [
      {
        path: "a",
        parent: null,
        childFiles: ["af0", "af1"],
        childClusters: [],
        kind: "folder",
      },
      {
        path: "b",
        parent: null,
        childFiles: ["bf0", "bf1"],
        childClusters: [],
        kind: "folder",
      },
    ],
  };
}

function nestedGraph(): Graph {
  // a/ contains a/x and direct a/af0; a/x contains files xf0..xf2.
  return {
    version: 2,
    root: ".",
    files: [
      mkFile("af0", "a"),
      mkFile("xf0", "a/x"),
      mkFile("xf1", "a/x"),
      mkFile("xf2", "a/x"),
    ],
    edges: [
      { source: "af0", target: "xf0", kind: "include", unresolved: null },
      { source: "xf1", target: "xf2", kind: "ref", unresolved: null },
    ],
    clusters: [
      {
        path: "a",
        parent: null,
        childFiles: ["af0"],
        childClusters: ["a/x"],
        kind: "folder",
      },
      {
        path: "a/x",
        parent: "a",
        childFiles: ["xf0", "xf1", "xf2"],
        childClusters: [],
        kind: "folder",
      },
    ],
  };
}

describe("computeTreeLayout — shape parity with cluster-layout", () => {
  beforeEach(() => __clearLayoutCache());

  it("returns the LaidOutClusterGraph shape (nodes + edges arrays)", async () => {
    const result = await computeTreeLayout(smallGraph(), new Set());
    expect(Array.isArray(result.nodes)).toBe(true);
    expect(Array.isArray(result.edges)).toBe(true);
  });

  it("emits one cluster node per top-level cluster when nothing is expanded", async () => {
    const result = await computeTreeLayout(smallGraph(), new Set());
    const clusterNodes = result.nodes.filter((n) => n.kind === "cluster");
    expect(clusterNodes.map((n) => n.id).sort()).toEqual(["a", "b"]);
    // Files are NOT visible at top-level when their cluster is collapsed.
    const fileNodes = result.nodes.filter((n) => n.kind === "file");
    expect(fileNodes).toHaveLength(0);
  });

  it("reveals child files when their cluster is expanded", async () => {
    const result = await computeTreeLayout(smallGraph(), new Set(["a"]));
    const fileNodes = result.nodes.filter((n) => n.kind === "file");
    expect(fileNodes.map((n) => n.id).sort()).toEqual(["af0", "af1"]);
    // File parent must be "a" so React Flow's parentNode pin works.
    for (const f of fileNodes) {
      expect(f.parent).toBe("a");
    }
  });

  it("nested clusters get their parent set to the enclosing cluster", async () => {
    const result = await computeTreeLayout(nestedGraph(), new Set(["a"]));
    const xCluster = result.nodes.find((n) => n.id === "a/x");
    expect(xCluster).toBeDefined();
    expect(xCluster?.parent).toBe("a");
  });

  it("retargets cross-cluster edges to nearest visible ancestors when child not expanded", async () => {
    // af0 is inside collapsed cluster "a", xf0 is inside collapsed "a/x".
    // Edge af0 -> xf0 should retarget to "a" -> "a/x" — but they share
    // ancestor "a", which after retargeting becomes a self-loop and is
    // dropped. So with NO expand, the af0->xf0 edge has src=a tgt=a → drop.
    const result = await computeTreeLayout(nestedGraph(), new Set());
    const dropped = result.edges.find(
      (e) => e.source === "a" && e.target === "a",
    );
    expect(dropped).toBeUndefined();
  });

  it("preserves direct edges when both endpoints are visible (expanded)", async () => {
    const result = await computeTreeLayout(nestedGraph(), new Set(["a", "a/x"]));
    const directEdge = result.edges.find(
      (e) => e.source === "af0" && e.target === "xf0",
    );
    expect(directEdge).toBeDefined();
    expect(directEdge?.count).toBe(1);
    expect(directEdge?.kind).toBe("include");
  });

  it("aggregates multiple edges between the same retargeted pair", async () => {
    // Two top-level clusters with two cross-edges between their files.
    const g: Graph = {
      ...smallGraph(),
      edges: [
        { source: "af0", target: "bf0", kind: "include", unresolved: null },
        { source: "af1", target: "bf1", kind: "include", unresolved: null },
      ],
    };
    const result = await computeTreeLayout(g, new Set());
    // Both retarget to a -> b.
    const aggregated = result.edges.find(
      (e) => e.source === "a" && e.target === "b",
    );
    expect(aggregated).toBeDefined();
    expect(aggregated?.count).toBe(2);
  });
});

describe("computeTreeLayout — determinism", () => {
  beforeEach(() => __clearLayoutCache());

  it("same (graph, expanded) input produces byte-identical positions", async () => {
    const g = smallGraph();
    const expanded = new Set(["a"]);
    const r1 = await computeTreeLayout(g, expanded);
    __clearLayoutCache(); // make sure cache hit isn't masking nondeterminism
    const r2 = await computeTreeLayout(g, expanded);
    expect(r1.nodes.map((n) => `${n.id}:${n.x},${n.y}`)).toEqual(
      r2.nodes.map((n) => `${n.id}:${n.x},${n.y}`),
    );
  });

  it("cache hit returns same coordinates without re-running ELK", async () => {
    const g = smallGraph();
    const r1 = await computeTreeLayout(g, new Set());
    // No cache-clear — second call must hit the LRU.
    const r2 = await computeTreeLayout(g, new Set());
    expect(r1.nodes).toEqual(r2.nodes);
  });
});

describe("computeTreeLayout — containment bbox tightening (Bug #1)", () => {
  beforeEach(() => __clearLayoutCache());

  /**
   * Builds a graph with deeply nested clusters that previously triggered the
   * Bug #1 overflow on the xlarge fixture: top → mid → 16 leaves. With both
   * top and mid expanded, mid's expanded footprint must fit inside top's
   * dimensions OR top must grow to contain it. Either way, the invariant is
   * "no child ever overflows its parent's declared bbox".
   */
  function deeplyNestedGraph(): Graph {
    const files = [];
    for (let i = 0; i < 16; i++) {
      files.push(mkFile(`leaf${i}`, "top/mid"));
    }
    return {
      version: 2,
      root: ".",
      files,
      edges: [],
      clusters: [
        {
          path: "top",
          parent: null,
          childFiles: [],
          childClusters: ["top/mid"],
          kind: "folder",
        },
        {
          path: "top/mid",
          parent: "top",
          childFiles: files.map((f) => f.id),
          childClusters: [],
          kind: "folder",
        },
      ],
    };
  }

  it("expanded child cluster never overflows its parent's bbox", async () => {
    const result = await computeTreeLayout(
      deeplyNestedGraph(),
      new Set(["top", "top/mid"]),
    );
    // Build an id → laid-out-node map.
    const byId = new Map(result.nodes.map((n) => [n.id, n] as const));
    const top = byId.get("top");
    const mid = byId.get("top/mid");
    expect(top).toBeDefined();
    expect(mid).toBeDefined();
    if (!top || !mid) return;
    // mid is parent-relative inside top. Its right/bottom must fit inside
    // top's width/height (with a small float-rounding tolerance).
    const midRight = mid.x + mid.width;
    const midBottom = mid.y + mid.height;
    expect(midRight).toBeLessThanOrEqual(top.width + 1);
    expect(midBottom).toBeLessThanOrEqual(top.height + 1);
  });

  it("expanded leaf files never overflow their parent cluster's bbox", async () => {
    const result = await computeTreeLayout(
      deeplyNestedGraph(),
      new Set(["top", "top/mid"]),
    );
    const byId = new Map(result.nodes.map((n) => [n.id, n] as const));
    const mid = byId.get("top/mid");
    expect(mid).toBeDefined();
    if (!mid) return;
    // Every file with parent === "top/mid" must fit within mid.
    for (const n of result.nodes) {
      if (n.parent !== "top/mid") continue;
      const right = n.x + n.width;
      const bottom = n.y + n.height;
      expect(right).toBeLessThanOrEqual(mid.width + 1);
      expect(bottom).toBeLessThanOrEqual(mid.height + 1);
    }
  });

  it("simple expand of a single child cluster still respects containment", async () => {
    // Smaller, simpler nested graph — proves the fix isn't only kicking in
    // at scale. nestedGraph() has a/x with 3 files; a contains af0 + a/x.
    const result = await computeTreeLayout(nestedGraph(), new Set(["a", "a/x"]));
    const byId = new Map(result.nodes.map((n) => [n.id, n] as const));
    const a = byId.get("a");
    const ax = byId.get("a/x");
    expect(a).toBeDefined();
    expect(ax).toBeDefined();
    if (!a || !ax) return;
    expect(ax.x + ax.width).toBeLessThanOrEqual(a.width + 1);
    expect(ax.y + ax.height).toBeLessThanOrEqual(a.height + 1);
  });
});

describe("computeTreeLayout — empty / edge cases", () => {
  beforeEach(() => __clearLayoutCache());

  it("graph with no clusters returns empty nodes + empty edges", async () => {
    const g: Graph = { version: 2, root: ".", files: [], edges: [], clusters: [] };
    const result = await computeTreeLayout(g, new Set());
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
  });
});

// Visual-review 2026-04-23 — extends polish-batch-1 item 1 to tree mode.
// When the dendrogram-style folder/file layout collapses two siblings'
// shared-folder cross-ref edges into a self-loop on the folder, we tally
// the count and surface it on the cluster node so ClusterNode can render
// the `↻ N` collapsed-folder badge.
describe("computeTreeLayout — intraClusterEdgeCount on collapsed folders", () => {
  beforeEach(() => __clearLayoutCache());

  it("tallies edges between two files inside the same collapsed folder", async () => {
    // Both files live under `a`. With `a` collapsed, the edge retargets
    // to (a, a) — a self-loop — which we count and surface as
    // intraClusterEdgeCount.
    const g: Graph = {
      version: 2,
      root: ".",
      files: [mkFile("af0", "a"), mkFile("af1", "a")],
      edges: [
        { source: "af0", target: "af1", kind: "include", unresolved: null },
        { source: "af1", target: "af0", kind: "ref", unresolved: null },
      ],
      clusters: [
        {
          path: "a",
          parent: null,
          childFiles: ["af0", "af1"],
          childClusters: [],
          kind: "folder",
        },
      ],
    };
    const result = await computeTreeLayout(g, new Set()); // a collapsed
    const aNode = result.nodes.find((n) => n.id === "a");
    expect(aNode).toBeDefined();
    expect(aNode?.intraClusterEdgeCount).toBe(2);
  });

  it("does NOT tally edges between two files in DIFFERENT folders", async () => {
    // Cross-folder edges retarget to (a, b) — drawable cross-ref, not a
    // self-loop, so the count stays 0.
    const result = await computeTreeLayout(smallGraph(), new Set());
    const aNode = result.nodes.find((n) => n.id === "a");
    const bNode = result.nodes.find((n) => n.id === "b");
    expect(aNode?.intraClusterEdgeCount).toBeUndefined();
    expect(bNode?.intraClusterEdgeCount).toBeUndefined();
  });
});
