import { describe, it, expect } from "vitest";
import {
  generateXLargeGraph,
  generateXXLargeGraph,
  generateSynthGraph,
  XLARGE_FIXTURE,
  XXLARGE_FIXTURE,
} from "./xlarge";
import { parseGraph } from "@/lib/graph/schema";

describe("generateXLargeGraph (~5k file scale-test fixture)", () => {
  const graph = generateXLargeGraph(1);

  it("produces ~5,000 files with deterministic count", () => {
    const expectedLeaves =
      XLARGE_FIXTURE.TOP * XLARGE_FIXTURE.MID * XLARGE_FIXTURE.LEAF;
    // Per .d-aggregate: -LEAF + D_AGGREGATE_CHILDREN + 1 sibling parent.
    const aggregateDelta =
      XLARGE_FIXTURE.D_AGGREGATE_COUNT *
      (XLARGE_FIXTURE.D_AGGREGATE_CHILDREN - XLARGE_FIXTURE.LEAF + 1);
    const expected = expectedLeaves + aggregateDelta;
    expect(graph.files.length).toBe(expected);
    expect(graph.files.length).toBeGreaterThanOrEqual(4500);
    expect(graph.files.length).toBeLessThanOrEqual(5500);
  });

  it("round-trips through the v2 zod schema", () => {
    const parsed = parseGraph(JSON.parse(JSON.stringify(graph)));
    expect(parsed.version).toBe(2);
    expect(parsed.clusters?.length).toBeGreaterThan(0);
  });

  it("hits realistic edge density (15-25% of files have outgoing refs)", () => {
    const refKinds = new Set(["include", "ref", "import", "xsd", "logical-id"]);
    const refs = graph.edges.filter((e) => refKinds.has(e.kind));
    const sourcesWithRefs = new Set(refs.map((e) => e.source));
    const ratio = sourcesWithRefs.size / graph.files.length;
    expect(ratio).toBeGreaterThan(0.1);
    expect(ratio).toBeLessThan(0.35);
  });

  it("includes hub files with high out-degree", () => {
    const outDegree = new Map<string, number>();
    for (const e of graph.edges) {
      outDegree.set(e.source, (outDegree.get(e.source) ?? 0) + 1);
    }
    const hubs = Array.from(outDegree.values()).filter((n) => n >= 10);
    expect(hubs.length).toBeGreaterThanOrEqual(XLARGE_FIXTURE.HUB_COUNT);
  });

  it("is byte-stable across re-runs with the same seed", () => {
    const a = JSON.stringify(generateXLargeGraph(1));
    const b = JSON.stringify(generateXLargeGraph(1));
    expect(a).toBe(b);
  });

  it("emits at least one cross-top-folder reference (interesting for layout)", () => {
    const fileById = new Map(graph.files.map((f) => [f.id, f]));
    const crossTop = graph.edges.filter((e) => {
      if (!e.target) return false;
      const s = fileById.get(e.source);
      const t = fileById.get(e.target);
      if (!s || !t) return false;
      return s.folder.split("/")[0] !== t.folder.split("/")[0];
    });
    expect(crossTop.length).toBeGreaterThan(50);
  });
});

describe("generateXXLargeGraph (~10k file stress fixture)", () => {
  const graph = generateXXLargeGraph(1);

  it("produces ~10,000 files with deterministic count", () => {
    const expectedLeaves =
      XXLARGE_FIXTURE.TOP * XXLARGE_FIXTURE.MID * XXLARGE_FIXTURE.LEAF;
    const aggregateDelta =
      XXLARGE_FIXTURE.D_AGGREGATE_COUNT *
      (XXLARGE_FIXTURE.D_AGGREGATE_CHILDREN - XXLARGE_FIXTURE.LEAF + 1);
    const expected = expectedLeaves + aggregateDelta;
    expect(graph.files.length).toBe(expected);
    expect(graph.files.length).toBeGreaterThanOrEqual(9000);
    expect(graph.files.length).toBeLessThanOrEqual(11000);
  });

  it("round-trips through the v2 zod schema", () => {
    const parsed = parseGraph(JSON.parse(JSON.stringify(graph)));
    expect(parsed.version).toBe(2);
  });
});

describe("generateSynthGraph (parametric)", () => {
  it("respects D_AGGREGATE_COUNT to produce d-aggregate clusters", () => {
    const g = generateSynthGraph(XLARGE_FIXTURE, 1);
    const d = g.clusters.filter((c) => c.kind === "d-aggregate");
    expect(d.length).toBe(XLARGE_FIXTURE.D_AGGREGATE_COUNT);
  });
});
