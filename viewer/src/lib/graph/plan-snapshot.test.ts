/**
 * Snapshot stripper invariants — `params` arrays are dropped; everything else
 * (top-level fields, nested file fields, edges, clusters) is preserved.
 *
 * Per locked Q6 (plan §1) — Plans store stripped snapshots so a plan-per-key
 * localStorage write stays under quota even on the xxlarge fixture.
 */
import { describe, expect, it } from "vitest";
import type { Graph, ParamNode } from "./types";
import { stripSnapshot } from "./plan-snapshot";

const param = (k: string): ParamNode => ({
  key: k,
  value: "v",
  kind: "scalar",
  line: 1,
});

function makeGraph(): Graph {
  return {
    version: 2,
    root: "/some/root",
    generatedAt: "2026-04-23T00:00:00Z",
    files: [
      {
        id: "aaaaaaaaaa",
        path: "src/a.xml",
        name: "a.xml",
        folder: "src",
        kind: "xml",
        sizeBytes: 123,
        params: [param("k1"), param("k2")],
        parseError: null,
        isTest: false,
        generated: false,
        generatedFrom: null,
      },
      {
        id: "bbbbbbbbbb",
        path: "src/b.yaml",
        name: "b.yaml",
        folder: "src",
        kind: "yaml",
        sizeBytes: 456,
        params: [param("k3")],
        parseError: "boom",
        isTest: true,
        generated: true,
        generatedFrom: "manifest.yaml",
      },
    ],
    edges: [
      { source: "aaaaaaaaaa", target: "bbbbbbbbbb", kind: "include", unresolved: null },
      { source: "bbbbbbbbbb", target: null, kind: "ref", unresolved: "missing.txt" },
    ],
    clusters: [
      {
        path: "src",
        parent: null,
        childFiles: ["aaaaaaaaaa", "bbbbbbbbbb"],
        childClusters: [],
        kind: "folder",
      },
    ],
  };
}

describe("stripSnapshot", () => {
  it("drops every FileNode.params (replaces with [])", () => {
    const g = makeGraph();
    const s = stripSnapshot(g);
    for (const f of s.files) {
      expect(f.params).toEqual([]);
    }
  });

  it("does NOT mutate the input graph", () => {
    const g = makeGraph();
    stripSnapshot(g);
    // Input still has its params after the call.
    expect(g.files[0].params).toHaveLength(2);
    expect(g.files[1].params).toHaveLength(1);
  });

  it("is idempotent — stripping twice equals stripping once", () => {
    const g = makeGraph();
    const a = stripSnapshot(g);
    const b = stripSnapshot(a);
    expect(b).toEqual(a);
  });

  it("preserves top-level Graph fields (version, root, generatedAt, clusters)", () => {
    const g = makeGraph();
    const s = stripSnapshot(g);
    expect(s.version).toBe(g.version);
    expect(s.root).toBe(g.root);
    expect(s.generatedAt).toBe(g.generatedAt);
    expect(s.clusters).toEqual(g.clusters);
  });

  it("preserves all FileNode fields except params", () => {
    const g = makeGraph();
    const s = stripSnapshot(g);
    for (let i = 0; i < g.files.length; i += 1) {
      const orig = g.files[i];
      const out = s.files[i];
      expect(out.id).toBe(orig.id);
      expect(out.path).toBe(orig.path);
      expect(out.name).toBe(orig.name);
      expect(out.folder).toBe(orig.folder);
      expect(out.kind).toBe(orig.kind);
      expect(out.sizeBytes).toBe(orig.sizeBytes);
      expect(out.parseError).toBe(orig.parseError);
      expect(out.isTest).toBe(orig.isTest);
      expect(out.generated).toBe(orig.generated);
      expect(out.generatedFrom).toBe(orig.generatedFrom);
    }
  });

  it("preserves edges array byte-identically (deep-equal)", () => {
    const g = makeGraph();
    const s = stripSnapshot(g);
    expect(s.edges).toEqual(g.edges);
  });

  it("returns a new Graph object (reference inequality)", () => {
    const g = makeGraph();
    const s = stripSnapshot(g);
    expect(s).not.toBe(g);
    expect(s.files).not.toBe(g.files);
  });

  it("handles a graph with no files", () => {
    const g: Graph = {
      version: 2,
      root: "/r",
      files: [],
      edges: [],
      clusters: [],
    };
    const s = stripSnapshot(g);
    expect(s.files).toEqual([]);
  });
});
