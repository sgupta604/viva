import { describe, it, expect } from "vitest";
import { generateLargeGraph, LARGE_FIXTURE } from "./large";
import { parseGraph } from "@/lib/graph/schema";

describe("generateLargeGraph", () => {
  const graph = generateLargeGraph(1);

  it("produces a deterministic file count close to 3000", () => {
    const expectedLeaves =
      LARGE_FIXTURE.TOP * LARGE_FIXTURE.MID * LARGE_FIXTURE.LEAF;
    // Each `.d/` aggregate replaces one MID folder (LEAF files, here 10) with
    // D_AGGREGATE_CHILDREN (10) children AND adds 1 sibling parent file. Net
    // per aggregate: -10 + 10 + 1 = +1.
    const expected = expectedLeaves + LARGE_FIXTURE.D_AGGREGATE_COUNT * 1;
    expect(graph.files.length).toBe(expected);
    expect(graph.files.length).toBeGreaterThanOrEqual(3000);
    expect(graph.files.length).toBeLessThanOrEqual(3010);
  });

  it("round-trips through the v2 zod schema", () => {
    const parsed = parseGraph(JSON.parse(JSON.stringify(graph)));
    expect(parsed.version).toBe(2);
    expect(parsed.clusters?.length).toBeGreaterThan(0);
  });

  it("emits at least 5 xsd edges", () => {
    const xsd = graph.edges.filter((e) => e.kind === "xsd");
    expect(xsd.length).toBeGreaterThanOrEqual(5);
  });

  it("emits at least 20 logical-id edges", () => {
    const logical = graph.edges.filter((e) => e.kind === "logical-id");
    expect(logical.length).toBeGreaterThanOrEqual(20);
  });

  it("emits d-aggregate edges with attrs.order", () => {
    const d = graph.edges.filter((e) => e.kind === "d-aggregate");
    expect(d.length).toBe(
      LARGE_FIXTURE.D_AGGREGATE_COUNT * LARGE_FIXTURE.D_AGGREGATE_CHILDREN,
    );
    for (const e of d) {
      expect(typeof e.attrs?.order).toBe("number");
    }
  });

  it("emits ≥ 1 include edge per top-level cluster", () => {
    const inc = graph.edges.filter((e) => e.kind === "include");
    expect(inc.length).toBeGreaterThanOrEqual(LARGE_FIXTURE.TOP);
  });

  it("is byte-stable across re-runs with the same seed", () => {
    const a = JSON.stringify(generateLargeGraph(1));
    const b = JSON.stringify(generateLargeGraph(1));
    expect(a).toBe(b);
  });

  it("marks `.d/` aggregate clusters with kind='d-aggregate'", () => {
    const d = graph.clusters.filter((c) => c.kind === "d-aggregate");
    expect(d.length).toBe(LARGE_FIXTURE.D_AGGREGATE_COUNT);
    for (const c of d) {
      expect(c.path.endsWith(".d")).toBe(true);
    }
  });
});
