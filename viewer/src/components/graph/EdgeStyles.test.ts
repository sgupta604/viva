import { describe, it, expect } from "vitest";
import {
  edgeStyleFor,
  EDGE_KIND_META,
  shouldDisablePointerEvents,
  treeEdgeBucket,
  treeEdgeStyleFor,
  TREE_HIERARCHY_COLOR,
  TREE_CROSSREF_COLOR,
  TREE_LEGEND_ROWS,
  crossRefOpacityFor,
  CROSSREF_DIM_OPACITY,
  CROSSREF_FULL_OPACITY,
} from "./EdgeStyles";
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

describe("treeEdgeBucket (tree-mode 2-color collapse)", () => {
  it("buckets d-aggregate as hierarchy", () => {
    expect(treeEdgeBucket("d-aggregate")).toBe("hierarchy");
  });

  it("buckets every other kind as cross-reference", () => {
    for (const k of [
      "include",
      "ref",
      "import",
      "xsd",
      "logical-id",
    ] as const) {
      expect(treeEdgeBucket(k)).toBe("crossref");
    }
  });
});

describe("treeEdgeStyleFor", () => {
  it("paints d-aggregate with the hierarchy slate color and thin stroke", () => {
    const s = treeEdgeStyleFor("d-aggregate", false);
    expect(s.stroke).toBe(TREE_HIERARCHY_COLOR);
    expect(s.strokeWidth).toBe(1);
  });

  it("paints all cross-ref kinds with the same accent color", () => {
    for (const k of ["include", "ref", "import", "xsd", "logical-id"] as const) {
      const s = treeEdgeStyleFor(k, false);
      expect(s.stroke).toBe(TREE_CROSSREF_COLOR);
      expect(s.strokeWidth).toBe(1.5);
    }
  });

  it("preserves the unresolved error treatment for any kind", () => {
    for (const k of [
      "include",
      "ref",
      "import",
      "xsd",
      "logical-id",
      "d-aggregate",
    ] as const) {
      const s = treeEdgeStyleFor(k, true);
      expect(s.stroke).toBe("#ef4444");
      expect(s.strokeDasharray).toBe("4 3");
    }
  });

  it("never re-uses any color from the cluster-mode palette for tree mode", () => {
    // Confirms the new tree palette is genuinely distinct — if a future
    // refactor accidentally points tree colors at one of the cluster
    // colors, this guard fires.
    const clusterColors = new Set(EDGE_KIND_META.map((m) => m.color));
    expect(clusterColors.has(TREE_HIERARCHY_COLOR)).toBe(false);
    expect(clusterColors.has(TREE_CROSSREF_COLOR)).toBe(false);
  });
});

describe("shouldDisablePointerEvents (flat-mode hierarchy decoration)", () => {
  // INVARIANT LOCK: in dendrogram + tree mode, the d-aggregate hierarchy
  // edges are decorative backbone — they MUST NOT swallow pointer events
  // or they intercept clicks meant for treeFolder cards underneath. This
  // is the regression-prevention guard for the dendrogram-layout E2E
  // "expand state survives round-trip" failure (folder.click() failing
  // because hierarchy edges sat above the card and ate the pointer).
  it("disables pointer events for d-aggregate edges in flat (dendrogram/tree) mode", () => {
    expect(shouldDisablePointerEvents("d-aggregate", true)).toBe(true);
  });

  it("keeps pointer events on d-aggregate edges in cluster mode", () => {
    // Cluster mode: cluster boxes ARE legitimate edge endpoints, so the
    // hierarchy edges can stay clickable. Only the flat modes have the
    // overlap-with-folder-card problem.
    expect(shouldDisablePointerEvents("d-aggregate", false)).toBe(false);
  });

  it("keeps pointer events on every cross-ref kind in every mode", () => {
    // Cross-ref edges (include/import/ref/xsd/logical-id) are user-
    // interactive in every mode — clicking them is a planned affordance
    // for inspecting the relation. Killing pointer events on them would
    // be a UX regression even in flat mode.
    for (const k of ["include", "ref", "import", "xsd", "logical-id"] as const) {
      expect(shouldDisablePointerEvents(k, true)).toBe(false);
      expect(shouldDisablePointerEvents(k, false)).toBe(false);
    }
  });
});

describe("crossRefOpacityFor (focus + context dimming)", () => {
  // INVARIANT LOCK: in flat (dendrogram/tree) modes, cross-ref edges dim by
  // default and light up when their endpoint is hovered/selected. Cluster
  // mode is intentionally untouched (user values cluster info-density), and
  // the d-aggregate hierarchy backbone never dims in any mode.
  it("dims cross-ref kinds in flat mode when nothing is focused", () => {
    for (const k of ["include", "ref", "import", "xsd", "logical-id"] as const) {
      expect(crossRefOpacityFor(k, true, false)).toBe(CROSSREF_DIM_OPACITY);
    }
  });

  it("returns full opacity for cross-ref kinds in flat mode when focused", () => {
    for (const k of ["include", "ref", "import", "xsd", "logical-id"] as const) {
      expect(crossRefOpacityFor(k, true, true)).toBe(CROSSREF_FULL_OPACITY);
    }
  });

  it("never dims hierarchy (d-aggregate) edges, focused or not, in any mode", () => {
    expect(crossRefOpacityFor("d-aggregate", true, false)).toBe(
      CROSSREF_FULL_OPACITY,
    );
    expect(crossRefOpacityFor("d-aggregate", true, true)).toBe(
      CROSSREF_FULL_OPACITY,
    );
    expect(crossRefOpacityFor("d-aggregate", false, false)).toBe(
      CROSSREF_FULL_OPACITY,
    );
  });

  it("never dims any kind in cluster mode (info-density preserved)", () => {
    for (const k of [
      "include",
      "ref",
      "import",
      "xsd",
      "logical-id",
      "d-aggregate",
    ] as const) {
      expect(crossRefOpacityFor(k, false, false)).toBe(CROSSREF_FULL_OPACITY);
      expect(crossRefOpacityFor(k, false, true)).toBe(CROSSREF_FULL_OPACITY);
    }
  });

  it("dim opacity is around 15% — visible enough to hint at structure, faint enough to recede", () => {
    // Lock the literal so a future "make it darker / brighter" tweak is a
    // single deliberate test edit, not a silent UX shift.
    expect(CROSSREF_DIM_OPACITY).toBe(0.15);
    expect(CROSSREF_FULL_OPACITY).toBe(1);
  });
});

describe("TREE_LEGEND_ROWS", () => {
  it("has exactly two rows: hierarchy + reference", () => {
    expect(TREE_LEGEND_ROWS.map((r) => r.bucket)).toEqual([
      "hierarchy",
      "reference",
    ]);
  });

  it("colors match treeEdgeStyleFor for each bucket", () => {
    const hierarchy = TREE_LEGEND_ROWS.find((r) => r.bucket === "hierarchy")!;
    const reference = TREE_LEGEND_ROWS.find((r) => r.bucket === "reference")!;
    expect(hierarchy.color).toBe(treeEdgeStyleFor("d-aggregate", false).stroke);
    expect(reference.color).toBe(treeEdgeStyleFor("include", false).stroke);
  });
});
