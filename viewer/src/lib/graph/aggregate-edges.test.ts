import { describe, it, expect } from "vitest";
import { aggregateEdges } from "./aggregate-edges";
import type { Edge } from "./types";

describe("aggregateEdges", () => {
  it("combines 5 mixed-kind edges into 1 aggregated with kind breakdown", () => {
    const edges: Edge[] = [
      { source: "A", target: "B", kind: "include", unresolved: null },
      { source: "A", target: "B", kind: "include", unresolved: null },
      { source: "A", target: "B", kind: "include", unresolved: null },
      { source: "A", target: "B", kind: "xsd", unresolved: null },
      { source: "A", target: "B", kind: "logical-id", unresolved: null },
    ];
    const agg = aggregateEdges(edges);
    expect(agg).toHaveLength(1);
    expect(agg[0].count).toBe(5);
    expect(agg[0].kindBreakdown).toEqual({
      include: 3,
      xsd: 1,
      "logical-id": 1,
    });
    // Dominant kind by precedence: include > ref > import > xsd > logical-id > d-aggregate
    expect(agg[0].kind).toBe("include");
  });

  it("keeps separate buckets per (source,target) pair", () => {
    const edges: Edge[] = [
      { source: "A", target: "B", kind: "include", unresolved: null },
      { source: "A", target: "C", kind: "include", unresolved: null },
      { source: "B", target: "C", kind: "ref", unresolved: null },
    ];
    const agg = aggregateEdges(edges);
    expect(agg).toHaveLength(3);
    const keys = agg.map((a) => `${a.source}->${a.target}`);
    expect(keys).toEqual(["A->B", "A->C", "B->C"]);
  });

  it("skips edges with null target", () => {
    const edges: Edge[] = [
      { source: "A", target: null, kind: "include", unresolved: "missing" },
      { source: "A", target: "B", kind: "include", unresolved: null },
    ];
    const agg = aggregateEdges(edges);
    expect(agg).toHaveLength(1);
    expect(agg[0].source).toBe("A");
    expect(agg[0].target).toBe("B");
  });

  it("picks dominant kind by precedence when no include/ref/import", () => {
    const edges: Edge[] = [
      { source: "A", target: "B", kind: "logical-id", unresolved: null },
      { source: "A", target: "B", kind: "d-aggregate", unresolved: null },
      { source: "A", target: "B", kind: "xsd", unresolved: null },
    ];
    const agg = aggregateEdges(edges);
    expect(agg[0].kind).toBe("xsd"); // xsd beats logical-id and d-aggregate
  });
});
