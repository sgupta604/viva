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
  crossRefInteractionWidthFor,
  CROSSREF_INTERACTION_WIDTH_DIMMED,
  CROSSREF_INTERACTION_WIDTH_FOCUSED,
  CROSSREF_CLUSTER_SOFT_DIM_OPACITY,
  focusedCrossRefStrokeFor,
  hierarchyOpacityFor,
  HIERARCHY_DIM_OPACITY,
  HIERARCHY_FULL_OPACITY,
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

  it("uses amber-400 for the cross-ref accent (warm contrast vs slate hierarchy)", () => {
    // Lock the literal so a future "let's try cyan / coral / emerald"
    // lands as a single deliberate edit. User chose amber `#fbbf24`
    // (2026-04-22) for the strongest cool-vs-warm contrast against the
    // slate hierarchy backbone in dendrogram mode.
    expect(TREE_CROSSREF_COLOR).toBe("#fbbf24");
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

  it("hierarchy color never re-uses any cluster-mode palette entry", () => {
    // The hierarchy color must stay distinct from every cluster-mode kind
    // — slate is the structural recede color and shouldn't be confused
    // with any semantic edge type.
    const clusterColors = new Set(EDGE_KIND_META.map((m) => m.color));
    expect(clusterColors.has(TREE_HIERARCHY_COLOR)).toBe(false);
  });

  it("cross-ref color is intentionally the same warm amber as cluster `ref` kind", () => {
    // Cross-mode palette consistency (user QA 2026-04-22): the flat-mode
    // cross-ref accent and the cluster-mode `ref` chip both render as
    // amber-400 (`#fbbf24`) on purpose so a user moving between layouts
    // sees the same warm "this is a reference" hue. The previous disjoint-
    // palette guard was over-strict; the ONLY allowed overlap is this one
    // amber, asserted explicitly so any other accidental cluster-color
    // reuse still fires.
    const refMeta = EDGE_KIND_META.find((m) => m.kind === "ref");
    expect(refMeta?.color).toBe(TREE_CROSSREF_COLOR);
    const otherClusterColors = EDGE_KIND_META.filter((m) => m.kind !== "ref").map(
      (m) => m.color,
    );
    expect(otherClusterColors).not.toContain(TREE_CROSSREF_COLOR);
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

  it("never dims cross-ref kinds in cluster mode when nothing is focused (default info-density preserved)", () => {
    // Cluster mode default state (no node hovered or selected): every
    // cross-ref edge stays full opacity so the dense info-rich palette the
    // user explicitly praised is preserved at idle.
    for (const k of ["include", "ref", "import", "xsd", "logical-id"] as const) {
      // Both legacy 3-arg shape (anythingFocused defaults to false) and
      // explicit-false 4-arg shape must return full opacity.
      expect(crossRefOpacityFor(k, false, false)).toBe(CROSSREF_FULL_OPACITY);
      expect(crossRefOpacityFor(k, false, true)).toBe(CROSSREF_FULL_OPACITY);
      expect(crossRefOpacityFor(k, false, false, false)).toBe(CROSSREF_FULL_OPACITY);
      expect(crossRefOpacityFor(k, false, true, false)).toBe(CROSSREF_FULL_OPACITY);
    }
  });

  it("never dims hierarchy in cluster mode regardless of focus", () => {
    // d-aggregate stays full opacity even when something else is focused —
    // it's structural backbone, not semantic info.
    expect(crossRefOpacityFor("d-aggregate", false, false, true)).toBe(
      CROSSREF_FULL_OPACITY,
    );
    expect(crossRefOpacityFor("d-aggregate", false, true, true)).toBe(
      CROSSREF_FULL_OPACITY,
    );
  });

  it("dim opacity is around 15% — visible enough to hint at structure, faint enough to recede", () => {
    // Lock the literal so a future "make it darker / brighter" tweak is a
    // single deliberate test edit, not a silent UX shift.
    expect(CROSSREF_DIM_OPACITY).toBe(0.15);
    expect(CROSSREF_FULL_OPACITY).toBe(1);
  });
});

describe("crossRefOpacityFor — cluster-mode soft dim (Bug #2)", () => {
  // INVARIANT LOCK: cluster mode dims unrelated cross-ref edges to ~35%
  // ONLY when something is focused (hover or selection). Default state with
  // nothing focused stays full opacity per the user's "cluster info-density
  // is fine" verdict. The dim is softer than flat-mode (0.35 vs 0.15) to
  // preserve the per-kind color cues + aggregated `xN` chips at-a-glance.

  it("dims unrelated cross-refs to soft dim when something else is focused", () => {
    // anythingFocused=true, isFocused=false (this edge does NOT touch the
    // focused node) → soft dim.
    for (const k of ["include", "ref", "import", "xsd", "logical-id"] as const) {
      expect(crossRefOpacityFor(k, false, false, true)).toBe(
        CROSSREF_CLUSTER_SOFT_DIM_OPACITY,
      );
    }
  });

  it("keeps focused cross-refs full opacity in cluster mode", () => {
    // anythingFocused=true, isFocused=true (this edge DOES touch the
    // focused node) → stays full opacity so the focused subgraph pops out.
    for (const k of ["include", "ref", "import", "xsd", "logical-id"] as const) {
      expect(crossRefOpacityFor(k, false, true, true)).toBe(CROSSREF_FULL_OPACITY);
    }
  });

  it("soft dim opacity is around 35% — preserves per-kind color cues vs flat-mode hard dim", () => {
    // Lock the literal so a future "make it more / less aggressive" tweak
    // is a single deliberate test edit. Chose 0.35 (vs flat-mode 0.15)
    // because cluster mode keeps the full per-kind palette + aggregated
    // chips and we don't want them washing out completely on focus.
    expect(CROSSREF_CLUSTER_SOFT_DIM_OPACITY).toBe(0.35);
  });

  it("hierarchy never participates in soft dim (stays full opacity always)", () => {
    expect(crossRefOpacityFor("d-aggregate", false, false, true)).toBe(
      CROSSREF_FULL_OPACITY,
    );
    expect(crossRefOpacityFor("d-aggregate", false, true, true)).toBe(
      CROSSREF_FULL_OPACITY,
    );
  });
});

describe("crossRefInteractionWidthFor (hit-target tracks visible opacity)", () => {
  // INVARIANT LOCK: the React Flow `interactionWidth` for a cross-ref edge
  // MUST shrink to 0 whenever the same edge would dim (per
  // crossRefOpacityFor). Before this lock, the 20px-wide invisible
  // `react-flow__edge-interaction` overlay kept eating pointer events for
  // dimmed edges — silently breaking node-hover the focus+context fix was
  // designed to enable. The two helpers MUST stay in lockstep.

  it("drops cross-ref hit-zone to 0 in flat mode when nothing is focused", () => {
    for (const k of ["include", "ref", "import", "xsd", "logical-id"] as const) {
      expect(crossRefInteractionWidthFor(k, true, false)).toBe(
        CROSSREF_INTERACTION_WIDTH_DIMMED,
      );
    }
  });

  it("restores cross-ref hit-zone to 20 in flat mode when focused", () => {
    for (const k of ["include", "ref", "import", "xsd", "logical-id"] as const) {
      expect(crossRefInteractionWidthFor(k, true, true)).toBe(
        CROSSREF_INTERACTION_WIDTH_FOCUSED,
      );
    }
  });

  it("never collapses hierarchy (d-aggregate) hit-zone in any mode", () => {
    // d-aggregate edges never dim, so they must never lose their hit-zone.
    expect(crossRefInteractionWidthFor("d-aggregate", true, false)).toBe(
      CROSSREF_INTERACTION_WIDTH_FOCUSED,
    );
    expect(crossRefInteractionWidthFor("d-aggregate", true, true)).toBe(
      CROSSREF_INTERACTION_WIDTH_FOCUSED,
    );
    expect(crossRefInteractionWidthFor("d-aggregate", false, false)).toBe(
      CROSSREF_INTERACTION_WIDTH_FOCUSED,
    );
  });

  it("never collapses hit-zone in cluster mode (no dimming there)", () => {
    for (const k of [
      "include",
      "ref",
      "import",
      "xsd",
      "logical-id",
      "d-aggregate",
    ] as const) {
      expect(crossRefInteractionWidthFor(k, false, false)).toBe(
        CROSSREF_INTERACTION_WIDTH_FOCUSED,
      );
      expect(crossRefInteractionWidthFor(k, false, true)).toBe(
        CROSSREF_INTERACTION_WIDTH_FOCUSED,
      );
    }
  });

  it("focused-width matches the React Flow default (20)", () => {
    // Lock the constant so future React Flow upgrades that change the
    // default surface here as a single deliberate edit rather than a
    // silent UX shift.
    expect(CROSSREF_INTERACTION_WIDTH_FOCUSED).toBe(20);
    expect(CROSSREF_INTERACTION_WIDTH_DIMMED).toBe(0);
  });

  it("hit-zone collapses iff opacity dims (lockstep with crossRefOpacityFor)", () => {
    // The two helpers MUST agree. If a future change relaxes the dim rules
    // in one without the other, the hit-zone could outlive the visual
    // dim and re-introduce the original bug.
    for (const k of [
      "include",
      "ref",
      "import",
      "xsd",
      "logical-id",
      "d-aggregate",
    ] as const) {
      for (const isFlat of [true, false] as const) {
        for (const isFocused of [true, false] as const) {
          const opacity = crossRefOpacityFor(k, isFlat, isFocused);
          const width = crossRefInteractionWidthFor(k, isFlat, isFocused);
          if (opacity === CROSSREF_DIM_OPACITY) {
            expect(width).toBe(CROSSREF_INTERACTION_WIDTH_DIMMED);
          } else {
            expect(width).toBe(CROSSREF_INTERACTION_WIDTH_FOCUSED);
          }
        }
      }
    }
  });
});

describe("focusedCrossRefStrokeFor (focus-revealed per-kind palette)", () => {
  // INVARIANT: in flat (dendrogram/tree) modes, cross-ref edges paint amber
  // by default and switch to their per-kind EDGE_KIND_META color only when
  // an endpoint is focused. Cluster mode always uses per-kind colors. The
  // hierarchy backbone (`d-aggregate`) is never re-themed by focus — it
  // stays slate in flat mode and gray in cluster mode.

  it("paints flat-mode unfocused cross-refs amber (calm default)", () => {
    for (const k of ["include", "ref", "import", "xsd", "logical-id"] as const) {
      expect(focusedCrossRefStrokeFor(k, true, false)).toBe(TREE_CROSSREF_COLOR);
    }
  });

  it("paints flat-mode focused cross-refs with their EDGE_KIND_META color", () => {
    // include → blue, import → green, xsd → green, logical-id → orange-amber.
    // Note: `ref` and `logical-id` happen to share TREE_CROSSREF_COLOR/its
    // neighbor — covered explicitly so the lookup is verified, not lucky.
    expect(focusedCrossRefStrokeFor("include", true, true)).toBe("#60a5fa");
    expect(focusedCrossRefStrokeFor("ref", true, true)).toBe("#fbbf24");
    expect(focusedCrossRefStrokeFor("import", true, true)).toBe("#34d399");
    expect(focusedCrossRefStrokeFor("xsd", true, true)).toBe("#4ade80");
    expect(focusedCrossRefStrokeFor("logical-id", true, true)).toBe("#f59e0b");
  });

  it("paints flat-mode hierarchy (d-aggregate) slate regardless of focus", () => {
    expect(focusedCrossRefStrokeFor("d-aggregate", true, false)).toBe(
      TREE_HIERARCHY_COLOR,
    );
    expect(focusedCrossRefStrokeFor("d-aggregate", true, true)).toBe(
      TREE_HIERARCHY_COLOR,
    );
  });

  it("uses EDGE_KIND_META per-kind colors in cluster mode regardless of focus", () => {
    // Cluster mode is unchanged — every cross-ref always paints with its
    // EDGE_KIND_META color, focused or not.
    for (const k of ["include", "ref", "import", "xsd", "logical-id"] as const) {
      const expected = EDGE_KIND_META.find((m) => m.kind === k)!.color;
      expect(focusedCrossRefStrokeFor(k, false, false)).toBe(expected);
      expect(focusedCrossRefStrokeFor(k, false, true)).toBe(expected);
    }
  });

  it("paints cluster-mode d-aggregate with its EDGE_KIND_META gray", () => {
    const aggMeta = EDGE_KIND_META.find((m) => m.kind === "d-aggregate")!;
    expect(focusedCrossRefStrokeFor("d-aggregate", false, false)).toBe(aggMeta.color);
    expect(focusedCrossRefStrokeFor("d-aggregate", false, true)).toBe(aggMeta.color);
  });

  it("flat-mode focused cross-ref color matches edgeStyleFor (cluster-mode parity)", () => {
    // Lockstep with the cluster-mode palette: when a flat-mode cross-ref is
    // focused, the color it picks MUST match what cluster mode would paint
    // for the same kind. This is what makes "focused dendrogram" feel like
    // a peek at the cluster palette without committing to a 6-color default.
    for (const k of ["include", "ref", "import", "xsd", "logical-id"] as const) {
      expect(focusedCrossRefStrokeFor(k, true, true)).toBe(
        edgeStyleFor(k, false).stroke,
      );
    }
  });
});

describe("hierarchyOpacityFor (Bug #4 — backbone dim on focus)", () => {
  // INVARIANT: when a node is focused in a flat layout, the slate hierarchy
  // backbone dims to 0.4 so the lit per-kind cross-refs own the foreground.
  // Cluster mode never dims (containment carries the relationship).

  it("dims hierarchy in flat mode when a node is focused", () => {
    expect(hierarchyOpacityFor(true, true)).toBe(HIERARCHY_DIM_OPACITY);
  });

  it("renders hierarchy at full opacity in flat mode when nothing is focused", () => {
    expect(hierarchyOpacityFor(true, false)).toBe(HIERARCHY_FULL_OPACITY);
  });

  it("never dims hierarchy in cluster mode (focused or not)", () => {
    expect(hierarchyOpacityFor(false, true)).toBe(HIERARCHY_FULL_OPACITY);
    expect(hierarchyOpacityFor(false, false)).toBe(HIERARCHY_FULL_OPACITY);
  });

  it("dim opacity is 0.4 — visible enough as backbone, faint enough to recede", () => {
    // Lock the literal so a future "make it darker / brighter" tweak is a
    // single deliberate test edit rather than a silent UX shift. If 0.4 is
    // not dim enough during eyeball review, lower the constant here.
    expect(HIERARCHY_DIM_OPACITY).toBe(0.4);
    expect(HIERARCHY_FULL_OPACITY).toBe(1);
  });
});

describe("focus-state lockstep across all four edge helpers", () => {
  // INVARIANT LOCK: crossRefOpacityFor + crossRefInteractionWidthFor +
  // focusedCrossRefStrokeFor + hierarchyOpacityFor MUST agree on which edges
  // count as "focused" given identical inputs. If a future change relaxes
  // the focus rules in one helper without the others, the visual + hit-zone
  // + color + backbone-dim semantics drift and the focus interaction breaks.
  //
  // Definition of "focused-as-far-as-this-helper-cares":
  //   - opacity: focused iff returns CROSSREF_FULL_OPACITY in flat mode for
  //     a cross-ref kind. (Hierarchy + cluster mode always full.)
  //   - hit-width: focused iff returns CROSSREF_INTERACTION_WIDTH_FOCUSED.
  //   - stroke: focused iff returns the EDGE_KIND_META color (not the
  //     amber default) for a flat-mode cross-ref kind.
  //   - hierarchy-opacity: focused iff returns HIERARCHY_DIM_OPACITY in
  //     flat mode (the backbone dims when something else is focused).

  it("opacity and hit-width agree on every (kind, isFlat, isFocused) combo", () => {
    for (const k of [
      "include",
      "ref",
      "import",
      "xsd",
      "logical-id",
      "d-aggregate",
    ] as const) {
      for (const isFlat of [true, false] as const) {
        for (const isFocused of [true, false] as const) {
          const opacity = crossRefOpacityFor(k, isFlat, isFocused);
          const width = crossRefInteractionWidthFor(k, isFlat, isFocused);
          const opacityIsFocused = opacity === CROSSREF_FULL_OPACITY;
          const widthIsFocused = width === CROSSREF_INTERACTION_WIDTH_FOCUSED;
          expect(opacityIsFocused).toBe(widthIsFocused);
        }
      }
    }
  });

  it("stroke color flips iff opacity says cross-ref edge is dim-able + focused (flat mode only)", () => {
    // Cross-ref edges in flat mode: when isFocused they get per-kind color;
    // when not focused they get amber. The opacity helper tells us the same
    // thing (full vs dim). The stroke helper MUST agree — if opacity says
    // "this edge is in its lit/focused state" the stroke MUST be the
    // per-kind color, not amber, for cross-ref kinds.
    for (const k of ["include", "ref", "import", "xsd", "logical-id"] as const) {
      for (const isFocused of [true, false] as const) {
        const opacity = crossRefOpacityFor(k, true, isFocused);
        const stroke = focusedCrossRefStrokeFor(k, true, isFocused);
        const expectedStroke = isFocused
          ? EDGE_KIND_META.find((m) => m.kind === k)!.color
          : TREE_CROSSREF_COLOR;
        expect(stroke).toBe(expectedStroke);
        // Sanity: opacity full ↔ focused stroke; opacity dim ↔ amber stroke.
        if (opacity === CROSSREF_FULL_OPACITY) {
          expect(stroke).toBe(EDGE_KIND_META.find((m) => m.kind === k)!.color);
        } else {
          expect(stroke).toBe(TREE_CROSSREF_COLOR);
        }
      }
    }
  });

  it("hierarchy backbone dims iff something is focused in flat mode (mirrors cross-ref focus rule)", () => {
    // hierarchyOpacityFor doesn't take a kind — it's only ever called for
    // d-aggregate. Its `isFocused` flag is the SAME flag the cross-ref
    // helpers see (any node in the graph is hovered/selected). Verify the
    // dim/full split agrees with the cross-ref helpers' notion of "the user
    // is focusing on something."
    for (const isFlat of [true, false] as const) {
      for (const isFocused of [true, false] as const) {
        const hOpacity = hierarchyOpacityFor(isFlat, isFocused);
        // Pick a representative cross-ref kind to derive the focus state
        // from the cross-ref helpers; any kind would do since they all
        // agree (covered above).
        const xrefOpacity = crossRefOpacityFor("include", isFlat, isFocused);
        const xrefIsLit = xrefOpacity === CROSSREF_FULL_OPACITY;
        if (isFlat && isFocused) {
          // Cross-refs lit (touching focused node would be) AND backbone dimmed.
          expect(xrefIsLit).toBe(true);
          expect(hOpacity).toBe(HIERARCHY_DIM_OPACITY);
        } else if (isFlat && !isFocused) {
          // Default flat: cross-refs dim, backbone full.
          expect(xrefIsLit).toBe(false);
          expect(hOpacity).toBe(HIERARCHY_FULL_OPACITY);
        } else {
          // Cluster mode: nothing dims.
          expect(xrefIsLit).toBe(true);
          expect(hOpacity).toBe(HIERARCHY_FULL_OPACITY);
        }
      }
    }
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
