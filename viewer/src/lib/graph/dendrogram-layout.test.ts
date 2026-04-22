import { describe, it, expect, beforeEach } from "vitest";
import { computeDendrogramLayout } from "./dendrogram-layout";
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

/** Two top-level clusters (a, b), each with two files, plus 2 cross-refs. */
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

/** a/ contains file af0 + sub-cluster a/x; a/x contains files xf0..xf2. */
function nestedGraph(): Graph {
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

describe("computeDendrogramLayout — shape parity with cluster-layout", () => {
  beforeEach(() => __clearLayoutCache());

  it("returns the LaidOutClusterGraph shape (nodes + edges arrays)", async () => {
    const result = await computeDendrogramLayout(smallGraph(), new Set());
    expect(Array.isArray(result.nodes)).toBe(true);
    expect(Array.isArray(result.edges)).toBe(true);
  });

  it("emits flat top-level nodes with parent === null (no containment)", async () => {
    const result = await computeDendrogramLayout(smallGraph(), new Set(["a"]));
    // Every visible node must be top-level — the dendrogram expresses parent
    // /child via DRAWN edges, never via React Flow's parentNode containment.
    for (const n of result.nodes) {
      expect(n.parent).toBeNull();
    }
  });

  it("emits treeFolder kind for visible folders, treeFile kind for visible files", async () => {
    const result = await computeDendrogramLayout(smallGraph(), new Set(["a"]));
    const folders = result.nodes.filter((n) => n.kind === "treeFolder");
    const files = result.nodes.filter((n) => n.kind === "treeFile");
    // Both top-level folders are always visible (a, b). Only `a` is expanded
    // so only its files (af0, af1) become visible; `b` contributes 0 files.
    expect(folders.map((n) => n.id).sort()).toEqual(["a", "b"]);
    expect(files.map((n) => n.id).sort()).toEqual(["af0", "af1"]);
    // No cluster/file kinds leak through from the cluster-layout path.
    const containmentNodes = result.nodes.filter(
      (n) => n.kind === "cluster" || n.kind === "file",
    );
    expect(containmentNodes).toHaveLength(0);
  });

  it("collapsing all clusters keeps top-level folders visible but no files", async () => {
    const result = await computeDendrogramLayout(smallGraph(), new Set());
    const folders = result.nodes.filter((n) => n.kind === "treeFolder");
    const files = result.nodes.filter((n) => n.kind === "treeFile");
    expect(folders.map((n) => n.id).sort()).toEqual(["a", "b"]);
    expect(files).toHaveLength(0);
  });
});

describe("computeDendrogramLayout — hierarchy edge injection", () => {
  beforeEach(() => __clearLayoutCache());

  it("injects one hier:* edge per visible parent → child pair when a folder is expanded", async () => {
    // smallGraph with `a` expanded: a → af0 + a → af1 (two file children).
    // Folder `b` is NOT expanded so it contributes no hier edges.
    const result = await computeDendrogramLayout(smallGraph(), new Set(["a"]));
    const hierEdges = result.edges.filter((e) => e.id.startsWith("hier:"));
    expect(hierEdges.map((e) => `${e.source}->${e.target}`).sort()).toEqual([
      "a->af0",
      "a->af1",
    ]);
    // Hierarchy edges use the d-aggregate kind so treeEdgeStyleFor returns
    // TREE_HIERARCHY_COLOR (slate-600). This is the contract.
    for (const e of hierEdges) {
      expect(e.kind).toBe("d-aggregate");
      expect(e.count).toBe(1);
    }
  });

  it("collapsing a parent removes its descendants AND their hierarchy edges", async () => {
    // Expand `a` → 3 visible (a, af0, af1) + 2 hier edges (a->af0, a->af1).
    // Then collapse `a` → only `a` visible + 0 hier edges (no `a->b` exists).
    const expanded = await computeDendrogramLayout(smallGraph(), new Set(["a"]));
    const collapsed = await computeDendrogramLayout(smallGraph(), new Set());
    const hierExpanded = expanded.edges.filter((e) => e.id.startsWith("hier:"));
    const hierCollapsed = collapsed.edges.filter((e) => e.id.startsWith("hier:"));
    expect(hierExpanded).toHaveLength(2);
    expect(hierCollapsed).toHaveLength(0);
    // And the file nodes themselves disappear.
    expect(expanded.nodes.find((n) => n.id === "af0")).toBeDefined();
    expect(collapsed.nodes.find((n) => n.id === "af0")).toBeUndefined();
  });

  it("nested clusters get one hier edge per parent-folder → child-folder hop", async () => {
    // Expand `a` (visible: a, af0, a/x) → expects hier a->af0 + a->a/x.
    // a/x is NOT expanded so its files (xf0..xf2) do not appear.
    const result = await computeDendrogramLayout(nestedGraph(), new Set(["a"]));
    const hierEdges = result.edges.filter((e) => e.id.startsWith("hier:"));
    expect(hierEdges.map((e) => `${e.source}->${e.target}`).sort()).toEqual([
      "a->a/x",
      "a->af0",
    ]);
  });
});

describe("computeDendrogramLayout — cross-reference edges", () => {
  beforeEach(() => __clearLayoutCache());

  it("preserves direct cross-ref edges between visible files (NOT converted to d-aggregate)", async () => {
    // Expand both clusters so af0 + bf0 are both visible. The original
    // include edge between them must survive with kind === "include".
    const result = await computeDendrogramLayout(smallGraph(), new Set(["a", "b"]));
    const includeEdge = result.edges.find(
      (e) => e.source === "af0" && e.target === "bf0",
    );
    expect(includeEdge).toBeDefined();
    expect(includeEdge?.kind).toBe("include");
    // Cross-ref edges must NOT have the hier:* id prefix.
    expect(includeEdge?.id.startsWith("hier:")).toBe(false);
  });

  it("retargets cross-ref edges through the cluster chain when an endpoint is hidden", async () => {
    // Only `a` expanded (a, af0, a/x visible). Edge xf1 → xf2 lives entirely
    // inside collapsed a/x → both endpoints retarget to a/x → self-loop after
    // retarget → dropped. Edge af0 → xf0: af0 is visible, xf0 isn't and its
    // chain walks up to a/x (visible) → retargets to af0 → a/x.
    const result = await computeDendrogramLayout(nestedGraph(), new Set(["a"]));
    const selfLoop = result.edges.find(
      (e) => e.source === "a/x" && e.target === "a/x",
    );
    expect(selfLoop).toBeUndefined();
    const retargeted = result.edges.find(
      (e) => e.source === "af0" && e.target === "a/x" && !e.id.startsWith("hier:"),
    );
    expect(retargeted).toBeDefined();
    expect(retargeted?.kind).toBe("include");
  });

  it("hierarchy edges precede cross-ref edges in output (paint order)", async () => {
    // React Flow renders edges in array order. Hierarchy must paint BELOW
    // cross-refs so the cyan cross-ref edges stay visible against the
    // slate hierarchy backbone.
    const result = await computeDendrogramLayout(smallGraph(), new Set(["a", "b"]));
    const firstNonHier = result.edges.findIndex((e) => !e.id.startsWith("hier:"));
    const lastHier = result.edges.findLastIndex((e) => e.id.startsWith("hier:"));
    expect(firstNonHier).toBeGreaterThan(lastHier);
  });
});

describe("computeDendrogramLayout — determinism", () => {
  beforeEach(() => __clearLayoutCache());

  it("same (graph, expanded) input produces byte-identical positions", async () => {
    const g = smallGraph();
    const expanded = new Set(["a"]);
    const r1 = await computeDendrogramLayout(g, expanded);
    __clearLayoutCache(); // make sure cache hit isn't masking nondeterminism
    const r2 = await computeDendrogramLayout(g, expanded);
    expect(r1.nodes.map((n) => `${n.id}:${n.x},${n.y}`)).toEqual(
      r2.nodes.map((n) => `${n.id}:${n.x},${n.y}`),
    );
  });

  it("cache hit returns same coordinates without re-running ELK", async () => {
    const g = smallGraph();
    const r1 = await computeDendrogramLayout(g, new Set());
    // No cache-clear — second call must hit the LRU.
    const r2 = await computeDendrogramLayout(g, new Set());
    expect(r1.nodes).toEqual(r2.nodes);
  });
});

describe("computeDendrogramLayout — empty / edge cases", () => {
  beforeEach(() => __clearLayoutCache());

  it("graph with no clusters returns empty nodes + empty edges", async () => {
    const g: Graph = { version: 2, root: ".", files: [], edges: [], clusters: [] };
    const result = await computeDendrogramLayout(g, new Set());
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
  });
});
