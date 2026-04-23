/**
 * Collapsed-cluster intra-edge badge — E2E coverage (polish-batch-1 item 1).
 *
 * Surfaces the count of edges between two files inside the same collapsed
 * cluster (which would otherwise drop silently as self-loops in
 * `retargetEdges`). Pill renders on the collapsed branch only, immediately
 * to the LEFT of the existing childCount pill, hidden when count is 0 or
 * undefined (no `↻ 0` noise per the user's "edges I can trust" rule).
 *
 * Cluster-mode only — `TreeFolderNode` (dendrogram) is intentionally not wired.
 */
import { test, expect, type Page } from "@playwright/test";
import { waitForGraphReady } from "./helpers";

/**
 * Fresh page with `clusters` explicitly selected via localStorage so the
 * ClusterNode renderer is in play. Pattern matches cluster-bezier-edges.spec.ts.
 */
async function gotoFreshClusters(page: Page, url = "/"): Promise<void> {
  await page.addInitScript(() => {
    try {
      window.localStorage.clear();
      window.sessionStorage.clear();
      window.localStorage.setItem("viva.viewStore.graphLayout", "clusters");
    } catch {
      // private mode — ignore
    }
  });
  await page.goto(url);
}

test.describe("Cluster intra-edge badge (polish-batch-1 item 1)", () => {
  test("default-collapsed top clusters with intra-cluster edges show ↻ N pill", async ({
    page,
  }) => {
    // The `large` fixture's top clusters every have ≥2 intra-cluster edges
    // rolled up from their nested sub-clusters.
    await gotoFreshClusters(page, "/?graph=large");
    await waitForGraphReady(page);
    await page.waitForTimeout(400);

    // Pick a cluster known to have intra-cluster edges (top00 has 12 in the
    // synthetic large fixture). The badge must be present, contain "↻", and
    // contain a positive integer count.
    const top00 = page.getByTestId("cluster-top00");
    await expect(top00).toBeVisible();
    const badge = page.getByTestId("cluster-intra-badge-top00");
    await expect(badge).toBeVisible();
    await expect(badge).toContainText("↻");
    const text = (await badge.textContent()) ?? "";
    const match = text.match(/↻\s*(\d+)/);
    expect(match, `expected "↻ N" pattern, got: ${text}`).not.toBeNull();
    expect(Number(match![1])).toBeGreaterThan(0);
  });

  test("default fixture (no intra-cluster edges) shows NO ↻ badge", async ({
    page,
  }) => {
    // Default `graph.json` (sample-module crawl) has only cross-cluster
    // edges — no intra-cluster edges. None of the cluster cards should
    // render a `↻` glyph.
    await gotoFreshClusters(page);
    await waitForGraphReady(page);
    await page.waitForTimeout(400);

    const badges = page.locator('[data-testid^="cluster-intra-badge-"]');
    expect(await badges.count()).toBe(0);
    const glyphs = page.locator("text=/↻/");
    expect(await glyphs.count()).toBe(0);
  });
});
