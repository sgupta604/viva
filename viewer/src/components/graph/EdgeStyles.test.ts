import { describe, it, expect } from "vitest";
import { edgeStyleFor, EDGE_KIND_META } from "./EdgeStyles";
import type { EdgeKind } from "@/lib/graph/types";

describe("edgeStyleFor", () => {
  it("colors include blue, ref amber, import green (v1 unchanged)", () => {
    expect(edgeStyleFor("include", false).stroke).toBe("#60a5fa");
    expect(edgeStyleFor("ref", false).stroke).toBe("#fbbf24");
    expect(edgeStyleFor("import", false).stroke).toBe("#34d399");
  });

  it("renders xsd as dashed green", () => {
    const s = edgeStyleFor("xsd", false);
    expect(s.stroke).toBe("#4ade80");
    expect(s.strokeDasharray).toBe("6 3");
  });

  it("renders d-aggregate as subtle gray thin", () => {
    const s = edgeStyleFor("d-aggregate", false);
    expect(s.stroke).toBe("#9ca3af");
    expect(s.strokeWidth).toBe(1);
  });

  it("renders logical-id as solid amber", () => {
    const s = edgeStyleFor("logical-id", false);
    expect(s.stroke).toBe("#f59e0b");
    expect(s.strokeDasharray).toBeUndefined();
  });

  it("applies red-dashed error treatment for any unresolved", () => {
    for (const k of [
      "include",
      "ref",
      "import",
      "xsd",
      "logical-id",
      "d-aggregate",
    ] as const) {
      const s = edgeStyleFor(k, true);
      expect(s.stroke).toBe("#ef4444");
      expect(s.strokeDasharray).toBe("4 3");
    }
  });
});

describe("EDGE_KIND_META", () => {
  it("contains every EdgeKind from the graph types union (no drift)", () => {
    // If a new EdgeKind is added to lib/graph/types.ts, this exhaustive switch
    // will fail to compile, surfacing the missing legend entry at build time.
    const expected: EdgeKind[] = [
      "include",
      "ref",
      "import",
      "xsd",
      "d-aggregate",
      "logical-id",
    ];
    const present = EDGE_KIND_META.map((m) => m.kind).sort();
    expect(present).toEqual([...expected].sort());
  });

  it("every entry has a non-empty label", () => {
    for (const meta of EDGE_KIND_META) {
      expect(meta.label.length).toBeGreaterThan(0);
    }
  });

  it("colors match what edgeStyleFor returns for the same kind", () => {
    for (const meta of EDGE_KIND_META) {
      const style = edgeStyleFor(meta.kind, false);
      expect(style.stroke).toBe(meta.color);
      if (meta.dasharray) {
        expect(style.strokeDasharray).toBe(meta.dasharray);
      }
    }
  });
});
