/**
 * composePlanGraph invariants — Phase 1's main correctness surface.
 *
 * The single most important guarantee: identity-passthrough by REFERENCE
 * equality when no plan is active. That's what makes the GraphCanvas wire-up
 * truly invisible — `applyFilters`'s `useMemo` deps don't fire spuriously.
 */
import { describe, expect, it } from "vitest";
import type { Edge, FileNode, Graph, ParamNode } from "./types";
import type { Plan, PlanEdits } from "@/lib/state/plan-mode-types";
import { composePlanGraph } from "./plan-overlay";
import { edgeKey, mintPlanEdgeId, mintPlanNodeId, mintPlanNoteId } from "./plan-ids";

const param = (k: string): ParamNode => ({ key: k, value: "v", kind: "scalar", line: 1 });

function makeFile(over: Partial<FileNode> = {}): FileNode {
  return {
    id: "aaaaaaaaaa",
    path: "src/a.xml",
    name: "a.xml",
    folder: "src",
    kind: "xml",
    sizeBytes: 100,
    params: [param("k")],
    parseError: null,
    isTest: false,
    generated: false,
    generatedFrom: null,
    ...over,
  };
}

function makeGraph(over: Partial<Graph> = {}): Graph {
  return {
    version: 2,
    root: "/r",
    files: [
      makeFile({ id: "aaaaaaaaaa", name: "a.xml", folder: "src", path: "src/a.xml" }),
      makeFile({ id: "bbbbbbbbbb", name: "b.yaml", folder: "src", path: "src/b.yaml", kind: "yaml" }),
    ],
    edges: [
      { source: "aaaaaaaaaa", target: "bbbbbbbbbb", kind: "include", unresolved: null },
    ],
    clusters: [
      { path: "src", parent: null, childFiles: ["aaaaaaaaaa", "bbbbbbbbbb"], childClusters: [], kind: "folder" },
    ],
    ...over,
  };
}

function emptyEdits(): PlanEdits {
  return {
    addedNodes: [],
    addedEdges: [],
    removedNodeIds: [],
    removedEdgeKeys: [],
    notes: [],
    renamedNodes: {},
  };
}

function makePlan(overEdits: Partial<PlanEdits> = {}): Plan {
  return {
    id: "plan:00000000-0000-0000-0000-000000000000",
    name: "test plan",
    createdAt: "2026-04-23T00:00:00Z",
    updatedAt: "2026-04-23T00:00:00Z",
    archived: false,
    baseGraph: makeGraph(),
    edits: { ...emptyEdits(), ...overEdits },
  };
}

describe("composePlanGraph — identity passthrough (Phase 1 main invariant)", () => {
  it("returns out.graph === live when enabled === false", () => {
    const live = makeGraph();
    const plan = makePlan({ addedNodes: [{ id: mintPlanNodeId(), name: "x", folder: "src", kind: "xml" }] });
    const out = composePlanGraph(live, plan, false);
    expect(out).not.toBeNull();
    expect(out!.graph).toBe(live);
    expect(out!.tombstonedNodeIds.size).toBe(0);
    expect(out!.tombstonedEdgeKeys.size).toBe(0);
    expect(out!.noteByTargetId.size).toBe(0);
  });

  it("returns out.graph === live when plan === null", () => {
    const live = makeGraph();
    const out = composePlanGraph(live, null, true);
    expect(out!.graph).toBe(live);
  });

  it("returns out.graph === live when plan.edits is empty", () => {
    const live = makeGraph();
    const plan = makePlan(); // emptyEdits()
    const out = composePlanGraph(live, plan, true);
    expect(out!.graph).toBe(live);
  });

  it("returns null when live === null (nothing to compose)", () => {
    expect(composePlanGraph(null, null, false)).toBeNull();
    expect(composePlanGraph(null, makePlan(), true)).toBeNull();
  });
});

describe("composePlanGraph — additions", () => {
  it("addedNodes appends to files; live array NOT mutated", () => {
    const live = makeGraph();
    const liveFilesSnap = [...live.files];
    const newId = mintPlanNodeId();
    const plan = makePlan({
      addedNodes: [{ id: newId, name: "new.xml", folder: "src", kind: "xml" }],
    });
    const out = composePlanGraph(live, plan, true)!;
    expect(out.graph.files.length).toBe(live.files.length + 1);
    expect(out.graph.files.find((f) => f.id === newId)).toBeDefined();
    // Live array reference not mutated.
    expect(live.files).toEqual(liveFilesSnap);
    expect(live.files.length).toBe(2);
  });

  it("addedEdges appends to edges", () => {
    const live = makeGraph();
    const newId = mintPlanEdgeId();
    const plan = makePlan({
      addedEdges: [{ id: newId, source: "aaaaaaaaaa", target: "bbbbbbbbbb", kind: "ref" }],
    });
    const out = composePlanGraph(live, plan, true)!;
    expect(out.graph.edges.length).toBe(live.edges.length + 1);
    const found = out.graph.edges.find((e: Edge) => e.source === "aaaaaaaaaa" && e.kind === "ref");
    expect(found).toBeDefined();
  });

  it("synthetic node lands in matching cluster's childFiles", () => {
    const live = makeGraph();
    const newId = mintPlanNodeId();
    const plan = makePlan({
      addedNodes: [{ id: newId, name: "c.json", folder: "src", kind: "json" }],
    });
    const out = composePlanGraph(live, plan, true)!;
    const srcCluster = out.graph.clusters!.find((c) => c.path === "src")!;
    expect(srcCluster.childFiles).toContain(newId);
    // Live cluster ref not mutated.
    expect(live.clusters!.find((c) => c.path === "src")!.childFiles).not.toContain(newId);
  });

  it("synthetic node WITHOUT a matching cluster does NOT crash", () => {
    const live = makeGraph();
    const newId = mintPlanNodeId();
    const plan = makePlan({
      addedNodes: [{ id: newId, name: "x.xml", folder: "lib/utils", kind: "xml" }],
    });
    const out = composePlanGraph(live, plan, true);
    expect(out).not.toBeNull();
    expect(out!.graph.files.find((f) => f.id === newId)).toBeDefined();
  });

  it("maps PlannedNode -> FileNode shape (params: [], parseError: null, ...)", () => {
    const live = makeGraph();
    const newId = mintPlanNodeId();
    const plan = makePlan({
      addedNodes: [{ id: newId, name: "n.yaml", folder: "src", kind: "yaml" }],
    });
    const out = composePlanGraph(live, plan, true)!;
    const synth = out.graph.files.find((f) => f.id === newId)!;
    expect(synth.params).toEqual([]);
    expect(synth.parseError).toBeNull();
    expect(synth.isTest).toBe(false);
    expect(synth.sizeBytes).toBe(0);
    expect(synth.generated).toBe(false);
    expect(synth.generatedFrom).toBeNull();
    expect(synth.path).toBe("src/n.yaml");
  });
});

describe("composePlanGraph — tombstones", () => {
  it("removedNodeIds is surfaced as a flag set; node STILL present in graph", () => {
    const live = makeGraph();
    const plan = makePlan({ removedNodeIds: ["aaaaaaaaaa"] });
    const out = composePlanGraph(live, plan, true)!;
    expect(out.tombstonedNodeIds.has("aaaaaaaaaa")).toBe(true);
    // Tombstones are render-time concerns (Phase 2). The node stays in the graph.
    expect(out.graph.files.find((f) => f.id === "aaaaaaaaaa")).toBeDefined();
  });

  it("removedEdgeKeys is surfaced as a flag set; edge STILL present", () => {
    const live = makeGraph();
    const k = edgeKey("aaaaaaaaaa", "include", "bbbbbbbbbb");
    const plan = makePlan({ removedEdgeKeys: [k] });
    const out = composePlanGraph(live, plan, true)!;
    expect(out.tombstonedEdgeKeys.has(k)).toBe(true);
    expect(out.graph.edges.length).toBe(live.edges.length);
  });
});

describe("composePlanGraph — notes", () => {
  it("notes are looked up by targetId via the noteByTargetId map", () => {
    const live = makeGraph();
    const noteId = mintPlanNoteId();
    const plan = makePlan({
      notes: [
        {
          id: noteId,
          targetId: "aaaaaaaaaa",
          targetKind: "node",
          text: "needs split",
          createdAt: "2026-04-23T00:00:00Z",
          updatedAt: "2026-04-23T00:00:00Z",
        },
      ],
    });
    const out = composePlanGraph(live, plan, true)!;
    expect(out.noteByTargetId.get("aaaaaaaaaa")?.text).toBe("needs split");
  });
});

describe("composePlanGraph — Stream G integration invariant (GraphCanvas wire-up)", () => {
  // This test mirrors what GraphCanvas does in its `composedGraph` useMemo.
  // The point: when the wired selectors yield (planModeEnabled=false, plan=null),
  // composePlanGraph(graph, null, false).graph === graph (REFERENCE EQUALITY),
  // so the downstream `filtered` useMemo sees an unchanged dep and never
  // re-runs spuriously. This is the contract that keeps Phase 1 invisible.
  it("composePlanGraph(live, null, false).graph === live (reference equality, the GraphCanvas no-op case)", () => {
    const live = makeGraph();
    const out = composePlanGraph(live, null, false);
    expect(out!.graph).toBe(live);
  });

  it("composePlanGraph(live, plan, false).graph === live even when plan has edits (toggle off wins)", () => {
    const live = makeGraph();
    const plan = makePlan({
      addedNodes: [{ id: mintPlanNodeId(), name: "x", folder: "src", kind: "xml" }],
    });
    const out = composePlanGraph(live, plan, false);
    expect(out!.graph).toBe(live);
  });
});

describe("composePlanGraph — determinism + non-mutation", () => {
  it("two calls with the same input produce deep-equal output", () => {
    const live = makeGraph();
    const plan = makePlan({
      addedNodes: [
        { id: "plan:node:zzz", name: "z.xml", folder: "src", kind: "xml" },
        { id: "plan:node:aaa", name: "a.xml", folder: "src", kind: "xml" },
      ],
    });
    const a = composePlanGraph(live, plan, true)!;
    const b = composePlanGraph(live, plan, true)!;
    expect(a.graph).toEqual(b.graph);
  });

  it("addedNodes are sorted by id before insertion (byte-stability)", () => {
    const live = makeGraph();
    const plan = makePlan({
      addedNodes: [
        { id: "plan:node:zzz", name: "z.xml", folder: "src", kind: "xml" },
        { id: "plan:node:aaa", name: "a.xml", folder: "src", kind: "xml" },
      ],
    });
    const out = composePlanGraph(live, plan, true)!;
    const synthIds = out.graph.files.filter((f) => f.id.startsWith("plan:")).map((f) => f.id);
    expect(synthIds).toEqual(["plan:node:aaa", "plan:node:zzz"]);
  });

  it("does NOT mutate live (snapshot deep-equal before/after)", () => {
    const live = makeGraph();
    const before = JSON.parse(JSON.stringify(live));
    const plan = makePlan({
      addedNodes: [{ id: mintPlanNodeId(), name: "x.xml", folder: "src", kind: "xml" }],
      addedEdges: [{ id: mintPlanEdgeId(), source: "aaaaaaaaaa", target: "bbbbbbbbbb", kind: "ref" }],
      removedNodeIds: ["aaaaaaaaaa"],
    });
    composePlanGraph(live, plan, true);
    expect(live).toEqual(before);
  });
});
