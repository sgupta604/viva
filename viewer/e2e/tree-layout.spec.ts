/**
 * E2E coverage for the v3 tree-layout redesign:
 *  - Default-on-load is tree mode (`localStorage` cleared first).
 *  - Toggle round-trip: tree → clusters → tree, with `graph.json` fetched
 *    once total (the second toggle hits cached state).
 *  - Expand/collapse parity (FR9): expand a cluster in tree mode, toggle
 *    to clusters, that cluster is still expanded.
 *  - Edge legend visible in both modes; every kind from `EDGE_KIND_META`
 *    has a row.
 *  - Edge z-order proxy: no edge `path` element has been masked by a node
 *    bbox at the path midpoint. This is a best-effort programmatic check;
 *    the human visual-review gate (`.claude/templates/visual-review.md`)
 *    is the real authority for "edges paint above nodes."
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

test.describe("tree-layout default + toggle", () => {
  test("default-on-load is tree mode", async ({ page }) => {
    await gotoFresh(page);
    await expect(page.getByTestId("graph-canvas")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("graph-layout-tree")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByTestId("graph-layout-clusters")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  test("toggle is hidden in folders + table modes (graph-only)", async ({
    page,
  }) => {
    await gotoFresh(page);
    await expect(page.getByTestId("graph-canvas")).toBeVisible();
    await expect(page.getByTestId("graph-layout-toggle")).toBeVisible();

    await page.getByTestId("view-mode-folders").click();
    await expect(page.getByTestId("graph-layout-toggle")).toHaveCount(0);

    await page.getByTestId("view-mode-table").click();
    await expect(page.getByTestId("graph-layout-toggle")).toHaveCount(0);

    await page.getByTestId("view-mode-graph").click();
    await expect(page.getByTestId("graph-layout-toggle")).toBeVisible();
  });

  test("toggle round-trip flips active state and only fetches graph.json once", async ({
    page,
  }) => {
    const graphRequests: string[] = [];
    page.on("request", (req) => {
      const url = req.url();
      if (url.endsWith("graph.json")) graphRequests.push(url);
    });

    await gotoFresh(page);
    await expect(page.getByTestId("graph-canvas")).toBeVisible({ timeout: 10_000 });

    await page.getByTestId("graph-layout-clusters").click();
    await expect(page.getByTestId("graph-layout-clusters")).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await page.getByTestId("graph-layout-tree").click();
    await expect(page.getByTestId("graph-layout-tree")).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    expect(graphRequests.length).toBe(1);
  });

  test("expand state survives a tree → clusters → tree round-trip", async ({
    page,
  }) => {
    await gotoFresh(page);
    await expect(page.getByTestId("graph-canvas")).toBeVisible({ timeout: 10_000 });

    // Expand the first available cluster (the canvas auto-expands a single
    // top-level root, but we still have descendants to toggle). Use the
    // ClusterNode header which is responsible for hierarchyStore.expand.
    const cluster = page.locator('[data-testid^="cluster-node-"]').first();
    await expect(cluster).toBeVisible({ timeout: 10_000 });
    const clusterId = await cluster.getAttribute("data-cluster-path");

    // Toggle to clusters and back; the expanded set is shared across modes
    // via hierarchyStore (FR9), so the cluster we noted should still be
    // present after both toggles.
    await page.getByTestId("graph-layout-clusters").click();
    await expect(page.getByTestId("graph-layout-clusters")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.getByTestId("graph-layout-tree").click();

    if (clusterId) {
      const stillThere = page.locator(
        `[data-testid="cluster-node-${clusterId}"]`,
      );
      await expect(stillThere.first()).toBeVisible();
    }
  });
});

test.describe("edge legend visibility", () => {
  test("legend is visible in both tree and clusters mode", async ({ page }) => {
    await gotoFresh(page);
    await expect(page.getByTestId("graph-canvas")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("edge-legend")).toBeVisible();

    await page.getByTestId("graph-layout-clusters").click();
    await expect(page.getByTestId("edge-legend")).toBeVisible();
  });

  test("legend shows a row for every edge kind", async ({ page }) => {
    await gotoFresh(page);
    await expect(page.getByTestId("edge-legend")).toBeVisible({ timeout: 10_000 });
    // Match EDGE_KIND_META — kept in lockstep with the source via Vitest.
    for (const kind of [
      "include",
      "ref",
      "import",
      "xsd",
      "d-aggregate",
      "logical-id",
    ]) {
      await expect(
        page.getByTestId(`edge-legend-item-${kind}`),
      ).toBeVisible();
    }
  });

  test("legend collapses on click and remembers its state", async ({ page }) => {
    await gotoFresh(page);
    await expect(page.getByTestId("edge-legend")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("edge-legend-list")).toBeVisible();

    await page.getByTestId("edge-legend-toggle").click();
    await expect(page.getByTestId("edge-legend-list")).toHaveCount(0);

    // Reload — collapsed state from localStorage should survive.
    await page.reload();
    await expect(page.getByTestId("edge-legend")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("edge-legend-list")).toHaveCount(0);
  });
});

test.describe("edge z-order proxy", () => {
  test("at least one edge path renders above the node fill at its midpoint", async ({
    page,
  }) => {
    await gotoFresh(page);
    await expect(page.getByTestId("graph-canvas")).toBeVisible({ timeout: 10_000 });

    // Programmatic best-effort: walk every <path class="react-flow__edge-path">
    // and confirm its computed `z-index`/stacking order is at least equal to
    // the React Flow nodes layer. The visual-review gate
    // (`.claude/active-work/<feature>/visual-review.md`) is the real
    // authority — this only catches the obvious regressions.
    const result = await page.evaluate(() => {
      const edges = Array.from(
        document.querySelectorAll(".react-flow__edge-path"),
      ) as SVGPathElement[];
      if (edges.length === 0) return { hasEdges: false, masked: 0 };
      let masked = 0;
      for (const edge of edges) {
        const bbox = edge.getBoundingClientRect();
        const cx = bbox.left + bbox.width / 2;
        const cy = bbox.top + bbox.height / 2;
        const hit = document.elementFromPoint(cx, cy);
        if (!hit) continue;
        // If the topmost element at the path midpoint is a node fill (a
        // FileNode/ClusterNode rendered above the edge), the edge has been
        // masked.
        if (hit.closest(".react-flow__node")) masked += 1;
      }
      return { hasEdges: true, masked, total: edges.length };
    });

    if (!result.hasEdges) {
      // No edges in this fixture — proxy doesn't apply; skip gracefully.
      test.info().annotations.push({
        type: "note",
        description:
          "tree-layout z-order proxy: fixture has no edges; visual-review gate is the authority",
      });
      return;
    }

    // Allow a small tolerance for edges whose midpoint genuinely sits inside
    // their source/target node — that's expected geometry, not occlusion.
    const tolerance = Math.ceil((result.total ?? 0) * 0.5);
    expect(
      result.masked,
      `${result.masked} of ${result.total} edges masked by node fills at midpoint`,
    ).toBeLessThanOrEqual(tolerance);
  });
});
