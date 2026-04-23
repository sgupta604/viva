/**
 * E2E coverage for the v3 dendrogram continuation (2026-04-22).
 *
 *   - Default-on-load is dendrogram (`localStorage` cleared first).
 *   - 3-mode round-trip: dendrogram → tree → clusters → dendrogram. The
 *     `graph.json` is fetched once across all toggles (cached state).
 *   - Expand/collapse parity (FR9): expand a folder in dendrogram, toggle
 *     to clusters, that cluster is still expanded.
 *   - Visual distinction: dendrogram emits flat `[data-tree-folder="true"]`
 *     cards (no React Flow `parentNode` containment). Tree mode emits
 *     ClusterNode containment boxes; clusters mode emits the same shape.
 */
import { test, expect, type Page } from "@playwright/test";

async function gotoFresh(page: Page, url = "/"): Promise<void> {
  await page.addInitScript(() => {
    try {
      window.localStorage.clear();
    } catch {
      // private mode — ignore
    }
  });
  await page.goto(url);
}

test.describe("dendrogram default + 3-mode toggle", () => {
  test("default-on-load is dendrogram for new users", async ({ page }) => {
    await gotoFresh(page);
    await expect(page.getByTestId("graph-canvas")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("graph-layout-dendrogram")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByTestId("graph-layout-tree")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await expect(page.getByTestId("graph-layout-clusters")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    // Wait for the async layout to settle so the flat folder cards are
    // actually in the DOM before we assert their presence.
    await expect(page.getByTestId("graph-canvas")).toHaveAttribute(
      "data-loading",
      "false",
      { timeout: 10_000 },
    );
    // At least one tree-folder card must be visible — the dendrogram's
    // defining property is flat `data-tree-folder` cards instead of
    // ClusterNode containment boxes.
    await expect(page.locator('[data-tree-folder="true"]').first()).toBeVisible();
  });

  test("3-mode round-trip flips the active pill and only fetches graph.json once", async ({
    page,
  }) => {
    const graphRequests: string[] = [];
    page.on("request", (req) => {
      const url = req.url();
      if (url.endsWith("graph.json")) graphRequests.push(url);
    });

    await gotoFresh(page);
    await expect(page.getByTestId("graph-canvas")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("graph-canvas")).toHaveAttribute(
      "data-loading",
      "false",
      { timeout: 10_000 },
    );

    // dendrogram (default) → tree
    await page.getByTestId("graph-layout-tree").click();
    await expect(page.getByTestId("graph-layout-tree")).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // tree → clusters
    await page.getByTestId("graph-layout-clusters").click();
    await expect(page.getByTestId("graph-layout-clusters")).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // clusters → dendrogram (round trip back to default)
    await page.getByTestId("graph-layout-dendrogram").click();
    await expect(page.getByTestId("graph-layout-dendrogram")).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    expect(graphRequests.length).toBe(1);
  });

  test("expand state survives dendrogram → clusters → dendrogram round-trip (FR9)", async ({
    page,
  }) => {
    await gotoFresh(page);
    await expect(page.getByTestId("graph-canvas")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("graph-canvas")).toHaveAttribute(
      "data-loading",
      "false",
      { timeout: 10_000 },
    );

    // Find a tree-folder card and capture its cluster path. Both the
    // dendrogram TreeFolderNode and cluster mode's ClusterNode share the
    // `cluster-${path}` testid prefix, so the same selector locates the
    // matching node in both modes.
    const folder = page.locator('[data-tree-folder="true"][data-cluster-path]').first();
    await expect(folder).toBeVisible({ timeout: 10_000 });
    const folderPath = await folder.getAttribute("data-cluster-path");
    expect(folderPath).toBeTruthy();
    if (!folderPath) return;

    // Expand it. data-expanded flips to "true" via hierarchyStore.
    await folder.click();
    await expect(folder).toHaveAttribute("data-expanded", "true");

    // Toggle to clusters and back. The matching cluster box must reflect
    // the same expanded state because hierarchyStore is the single source
    // of expand state across all three modes.
    await page.getByTestId("graph-layout-clusters").click();
    await expect(page.getByTestId("graph-layout-clusters")).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    const matchingCluster = page.locator(`[data-testid="cluster-${folderPath}"]`).first();
    await expect(matchingCluster).toBeVisible();
    await expect(matchingCluster).toHaveAttribute("data-expanded", "true");

    // Back to dendrogram: still expanded.
    await page.getByTestId("graph-layout-dendrogram").click();
    await expect(page.getByTestId("graph-layout-dendrogram")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const backInDendro = page.locator(
      `[data-testid="cluster-${folderPath}"][data-tree-folder="true"]`,
    );
    await expect(backInDendro).toHaveAttribute("data-expanded", "true");
  });

  test("dendrogram emits flat tree-folder cards (no parentNode containment)", async ({
    page,
  }) => {
    await gotoFresh(page);
    await expect(page.getByTestId("graph-canvas")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("graph-canvas")).toHaveAttribute(
      "data-loading",
      "false",
      { timeout: 10_000 },
    );

    // Visual-distinction proxy: in dendrogram mode every visible folder
    // card must carry `data-tree-folder="true"`. In tree / clusters mode
    // none of them do (those modes use ClusterNode which does NOT set the
    // attribute).
    const dendroFolders = await page
      .locator('[data-tree-folder="true"]')
      .count();
    expect(dendroFolders).toBeGreaterThan(0);

    // Toggle to tree mode → tree-folder cards must disappear (replaced by
    // ClusterNode containment boxes).
    await page.getByTestId("graph-layout-tree").click();
    await expect(page.getByTestId("graph-layout-tree")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // Allow the async layout swap to settle.
    await page.waitForTimeout(500);
    await expect(page.locator('[data-tree-folder="true"]')).toHaveCount(0);

    // Cluster mode also has no tree-folder cards.
    await page.getByTestId("graph-layout-clusters").click();
    await expect(page.locator('[data-tree-folder="true"]')).toHaveCount(0);
  });
});

test.describe("dendrogram focus-revealed cross-ref palette (Option D, 2026-04-22)", () => {
  /**
   * INVARIANT: in dendrogram mode, cross-ref edges paint amber by default
   * and switch to their EDGE_KIND_META per-kind color when one of their
   * endpoints is hovered or selected. Hierarchy `d-aggregate` edges stay
   * slate. Non-touching cross-ref edges remain dim amber even when
   * something else is focused.
   *
   * Setup: expand the `config` and `pipelines` folders in the e2e fixture
   * so file nodes are visible. `aa9b318519` (config) has multiple cross-ref
   * kinds — `import` OUT to `0791a5826a` and `include` IN from `d1efb571e6`
   * — making it the canonical multi-kind hub.
   */
  test("hovering a file lights its touching cross-refs in per-kind colors AND keeps untouching edges amber", async ({
    page,
  }) => {
    await gotoFresh(page);
    await expect(page.getByTestId("graph-canvas")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("graph-canvas")).toHaveAttribute(
      "data-loading",
      "false",
      { timeout: 10_000 },
    );

    // Expand the folders that hold our multi-kind hub file.
    const configFolder = page.locator('[data-tree-folder="true"][data-cluster-path="config"]');
    const pipelinesFolder = page.locator(
      '[data-tree-folder="true"][data-cluster-path="pipelines"]',
    );
    const environmentsFolder = page.locator(
      '[data-tree-folder="true"][data-cluster-path="environments"]',
    );
    await configFolder.click();
    await pipelinesFolder.click();
    await environmentsFolder.click();
    // Allow ELK re-layout to settle after the three expand calls.
    await page.waitForTimeout(800);

    // Default-state baseline: at least one cross-ref edge should be amber
    // (the dim default). React Flow renders edges as <g class="react-flow__edge"
    // data-id="<edgeId>"> with an inner <path class="react-flow__edge-path">
    // whose computed stroke matches the React Flow `style.stroke` we set.
    const allEdgePaths = page.locator(".react-flow__edge .react-flow__edge-path");
    await expect(allEdgePaths.first()).toBeVisible();

    // Hover the multi-kind hub file. The file node carries
    // `data-testid="node-aa9b318519"` (FileNode emits node-${file.id}).
    const hubNode = page.getByTestId("node-aa9b318519");
    await expect(hubNode).toBeVisible();
    await hubNode.hover();
    // Allow the hover→store→re-render to settle.
    await page.waitForTimeout(300);

    // Inspect every edge's computed stroke color. Group by:
    //   - touching the hub node → MUST be a per-kind EDGE_KIND_META color
    //     (NOT amber) — we expect at least one blue (include) or green
    //     (import) hit.
    //   - not touching the hub → MUST stay amber (or slate for d-aggregate).
    //
    // React Flow edges expose their ID via `data-testid="rf__edge-<edgeId>"`
    // (NOT `data-id`). Edge IDs follow the pattern
    // `<source>-><target>-<kind>-<idx>` for cross-refs, or `hier:<...>`
    // for the auto-injected dendrogram hierarchy edges. Hub-touching means
    // the source or target is the hub file ID.
    const HUB_INVOLVED_PATTERN = /aa9b318519/;
    const result = await page.evaluate((hubPattern) => {
      const re = new RegExp(hubPattern);
      const out: Array<{
        edgeId: string | null;
        stroke: string;
        opacity: string;
        touchesHub: boolean;
      }> = [];
      document
        .querySelectorAll<SVGGElement>(".react-flow__edge")
        .forEach((g) => {
          const path = g.querySelector<SVGPathElement>(".react-flow__edge-path");
          if (!path) return;
          const computed = window.getComputedStyle(path);
          // React Flow's testid is `rf__edge-<edgeId>` — strip the prefix to
          // get the bare edge ID for source/target matching.
          const tid = g.getAttribute("data-testid") ?? "";
          const edgeId = tid.startsWith("rf__edge-")
            ? tid.slice("rf__edge-".length)
            : tid;
          out.push({
            edgeId,
            stroke: computed.stroke,
            opacity: computed.opacity,
            touchesHub: re.test(edgeId),
          });
        });
      return out;
    }, HUB_INVOLVED_PATTERN.source);

    // Stroke colors come back as `rgb(r, g, b)` from getComputedStyle.
    // EDGE_KIND_META: include #60a5fa = rgb(96, 165, 250)
    //                 import  #34d399 = rgb(52, 211, 153)
    //                 ref     #fbbf24 = rgb(251, 191, 36) (also amber default)
    // TREE_CROSSREF_COLOR amber = rgb(251, 191, 36)
    // UNRESOLVED red #ef4444 = rgb(239, 68, 68)
    const KIND_COLORS = {
      include: "rgb(96, 165, 250)",
      import: "rgb(52, 211, 153)",
      amber: "rgb(251, 191, 36)",
      red: "rgb(239, 68, 68)",
    };

    // At least one HUB-touching edge has a per-kind color (NOT amber, NOT red).
    // This proves the focus-revealed palette is firing for the hub's edges.
    const litPerKind = result.filter(
      (r) =>
        r.touchesHub &&
        r.stroke !== KIND_COLORS.amber &&
        r.stroke !== KIND_COLORS.red,
    );
    expect(
      litPerKind.length,
      `expected at least one hub-touching edge to switch to a per-kind color; got: ${JSON.stringify(result.filter((r) => r.touchesHub))}`,
    ).toBeGreaterThan(0);

    // The lit per-kind colors must come from the EDGE_KIND_META palette
    // (not random hues). Specifically include (blue) or import (green).
    const litKindColors = new Set(litPerKind.map((r) => r.stroke));
    const isFromMeta = [...litKindColors].some(
      (c) => c === KIND_COLORS.include || c === KIND_COLORS.import,
    );
    expect(
      isFromMeta,
      `lit hub edges should include EDGE_KIND_META blue or green; saw: ${[...litKindColors].join(", ")}`,
    ).toBe(true);

    // Background invariant: at least one cross-ref edge that does NOT touch
    // the hub stays amber (the dim background remains amber, not per-kind).
    // We filter out red unresolved edges and slate hierarchy from this check.
    const SLATE_HIERARCHY = "rgb(71, 85, 105)"; // #475569
    const dimBackgroundAmber = result.filter(
      (r) =>
        !r.touchesHub &&
        r.stroke === KIND_COLORS.amber &&
        r.stroke !== SLATE_HIERARCHY,
    );
    expect(
      dimBackgroundAmber.length,
      `expected at least one untouched cross-ref edge to stay amber; got: ${JSON.stringify(result.filter((r) => !r.touchesHub))}`,
    ).toBeGreaterThan(0);
  });

  /**
   * INVARIANT: in dendrogram mode, hierarchy `d-aggregate` edges drop to
   * 0.4 opacity whenever any node is focused. Un-hover restores 1.0.
   * Cluster mode is unaffected — hierarchy is expressed via containment
   * there, so this test is dendrogram-only.
   *
   * Implementation note: in flat mode, `d-aggregate` edges are also marked
   * `pointerEvents: none`, so they appear in the rendered SVG with their
   * inline `style.opacity` reflecting the helper's output.
   */
  test("hierarchy backbone dims to 0.4 when any node is focused, returns to 1.0 on un-hover", async ({
    page,
  }) => {
    await gotoFresh(page);
    await expect(page.getByTestId("graph-canvas")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("graph-canvas")).toHaveAttribute(
      "data-loading",
      "false",
      { timeout: 10_000 },
    );

    // Hierarchy edges in dendrogram mode are the auto-injected
    // `hier:<parent>-><child>` `d-aggregate` lines drawn from a folder card
    // to each of its directly-contained file/folder nodes. They only render
    // when a folder is EXPANDED — so we expand `config` to materialize a
    // bundle of hierarchy edges to test against.
    await page.locator('[data-tree-folder="true"][data-cluster-path="config"]').click();
    await page.waitForTimeout(800);

    // Helper: collect the opacities of every hierarchy-colored edge path.
    // We use slate stroke (`rgb(71, 85, 105)` = `#475569`) as a proxy for
    // d-aggregate kind because React Flow doesn't surface our edge `data.kind`
    // through to the DOM. Anything matching the slate color in flat mode IS
    // a hierarchy edge by construction (focusedCrossRefStrokeFor maps any
    // cross-ref kind to amber or per-kind, never slate).
    const collectHierarchyOpacities = () =>
      page.evaluate(() => {
        const out: number[] = [];
        document
          .querySelectorAll<SVGGElement>(".react-flow__edge")
          .forEach((g) => {
            const path = g.querySelector<SVGPathElement>(".react-flow__edge-path");
            if (!path) return;
            const computed = window.getComputedStyle(path);
            if (computed.stroke === "rgb(71, 85, 105)") {
              out.push(parseFloat(computed.opacity));
            }
          });
        return out;
      });

    // Default state: every hierarchy edge should be at full opacity (1).
    const baseline = await collectHierarchyOpacities();
    expect(
      baseline.length,
      "expected hierarchy d-aggregate edges to render after expanding `config`",
    ).toBeGreaterThan(0);
    for (const op of baseline) {
      expect(op).toBeCloseTo(1, 1);
    }

    // Hover any file node — that triggers `anythingFocused === true`, which
    // hierarchyOpacityFor reads to drop the backbone to 0.4.
    const anyFile = page.locator("[data-testid^='node-']").first();
    await expect(anyFile).toBeVisible();
    await anyFile.hover();
    await page.waitForTimeout(300);

    const hovered = await collectHierarchyOpacities();
    expect(hovered.length).toBe(baseline.length);
    for (const op of hovered) {
      expect(op).toBeCloseTo(0.4, 1);
    }

    // Move pointer off all nodes — opacity returns to 1.0.
    await page.mouse.move(0, 0);
    await page.waitForTimeout(300);

    const restored = await collectHierarchyOpacities();
    for (const op of restored) {
      expect(op).toBeCloseTo(1, 1);
    }
  });
});

test.describe("dendrogram localStorage migration", () => {
  test("a stored 'tree' value rehydrates as tree (no migration to dendrogram)", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      try {
        window.localStorage.clear();
        window.localStorage.setItem("viva.viewStore.graphLayout", "tree");
      } catch {
        /* ignore */
      }
    });
    await page.goto("/");
    await expect(page.getByTestId("graph-canvas")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("graph-layout-tree")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByTestId("graph-layout-dendrogram")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  test("a stored 'clusters' value rehydrates as clusters (no migration)", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      try {
        window.localStorage.clear();
        window.localStorage.setItem("viva.viewStore.graphLayout", "clusters");
      } catch {
        /* ignore */
      }
    });
    await page.goto("/");
    await expect(page.getByTestId("graph-canvas")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("graph-layout-clusters")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
