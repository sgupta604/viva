import { describe, it, expect } from "vitest";
import { parseGraph, graphSchema } from "./schema";
import fixture from "../../../e2e/fixtures/graph.json";

describe("graph schema", () => {
  it("parses the committed fixture", () => {
    const g = parseGraph(fixture);
    // v1 or v2 both OK here — fixture may be either depending on pipeline state.
    expect([1, 2]).toContain(g.version);
    expect(Array.isArray(g.files)).toBe(true);
    expect(Array.isArray(g.edges)).toBe(true);
  });

  it("rejects a missing files field", () => {
    const bad = { ...(fixture as object), files: undefined };
    const result = graphSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects an unknown file kind", () => {
    const mutated = JSON.parse(JSON.stringify(fixture));
    if (mutated.files.length > 0) mutated.files[0].kind = "toml";
    const result = graphSchema.safeParse(mutated);
    expect(result.success).toBe(false);
  });
});

// --- v2 schema + v1→v2 upgrade shim (F.3) -----------------------------------

const v1SampleGraph = {
  version: 1,
  root: "sample",
  files: [
    {
      id: "abc",
      path: "a.xml",
      name: "a.xml",
      folder: "",
      kind: "xml",
      sizeBytes: 10,
      params: [],
      parseError: null,
      isTest: false,
    },
  ],
  edges: [
    {
      source: "abc",
      target: null,
      kind: "include",
      unresolved: "missing.xml",
    },
  ],
};

const v2SampleGraph = {
  version: 2,
  root: "sample",
  files: [
    {
      id: "abc",
      path: "a.xml",
      name: "a.xml",
      folder: "",
      kind: "xml",
      sizeBytes: 10,
      params: [],
      parseError: null,
      isTest: false,
      generated: false,
      generatedFrom: null,
    },
    {
      id: "def",
      path: "tpl/out.xml",
      name: "out.xml",
      folder: "tpl",
      kind: "xml",
      sizeBytes: 20,
      params: [],
      parseError: null,
      isTest: false,
      generated: true,
      generatedFrom: "tpl/manifest.yaml",
    },
  ],
  edges: [
    {
      source: "abc",
      target: "def",
      kind: "include",
      unresolved: null,
    },
    {
      source: "abc",
      target: "def",
      kind: "d-aggregate",
      unresolved: null,
      attrs: { order: 1 },
    },
    {
      source: "abc",
      target: null,
      kind: "include",
      unresolved: "fallback:gone.xml",
    },
    {
      source: "abc",
      target: null,
      kind: "xsd",
      unresolved: "ambiguous:schema.xsd",
    },
  ],
  clusters: [
    {
      path: "tpl",
      parent: null,
      childFiles: ["def"],
      childClusters: [],
      kind: "folder",
    },
  ],
};

describe("graph schema v2", () => {
  it("parses a v2 graph with clusters and widened edge kinds", () => {
    const g = parseGraph(v2SampleGraph);
    expect(g.version).toBe(2);
    const clusters = g.clusters ?? [];
    expect(clusters.length).toBe(1);
    expect(clusters[0].childFiles).toEqual(["def"]);
    expect(g.edges.find((e) => e.kind === "d-aggregate")?.attrs?.order).toBe(1);
    expect(g.edges.find((e) => e.kind === "xsd")).toBeDefined();
  });

  it("preserves generated + generatedFrom on v2 FileNodes", () => {
    const g = parseGraph(v2SampleGraph);
    const gen = g.files.find((f) => f.generated === true);
    expect(gen?.generatedFrom).toBe("tpl/manifest.yaml");
  });

  it("upgrades a v1 graph — clusters defaults to [], generated flags default", () => {
    const g = parseGraph(v1SampleGraph);
    expect(g.version).toBe(1);
    expect(Array.isArray(g.clusters)).toBe(true);
    expect(g.clusters ?? []).toEqual([]);
    // Every v1 file picks up generated=false / generatedFrom=null defaults.
    for (const f of g.files) {
      expect(f.generated).toBe(false);
      expect(f.generatedFrom).toBeNull();
    }
  });

  it("accepts unresolved prefix classifications on v2 edges", () => {
    const g = parseGraph(v2SampleGraph);
    const fallback = g.edges.find(
      (e) => e.unresolved && e.unresolved.startsWith("fallback:"),
    );
    const ambiguous = g.edges.find(
      (e) => e.unresolved && e.unresolved.startsWith("ambiguous:"),
    );
    expect(fallback).toBeDefined();
    expect(ambiguous).toBeDefined();
  });

  it("rejects an unknown edge kind", () => {
    const bad = JSON.parse(JSON.stringify(v2SampleGraph));
    bad.edges[0].kind = "not-a-kind";
    const r = graphSchema.safeParse(bad);
    expect(r.success).toBe(false);
  });

  it("rejects an unknown cluster kind", () => {
    const bad = JSON.parse(JSON.stringify(v2SampleGraph));
    bad.clusters[0].kind = "not-a-cluster-kind";
    const r = graphSchema.safeParse(bad);
    expect(r.success).toBe(false);
  });
});
