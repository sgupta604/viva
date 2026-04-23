/**
 * Collapsed-folder intra-edge badge — E2E coverage.
 *
 * Surfaces the count of edges between two files inside the same collapsed
 * folder (which would otherwise drop silently as self-loops in
 * `retargetEdges`). Pill renders on the collapsed branch only, immediately
 * to the LEFT of the existing childCount pill, hidden when count is 0 or
 * undefined (no `↻ 0` noise per the user's "edges I can trust" rule).
 *
 * Coverage:
 *   - cluster mode (polish-batch-1 item 1) — ClusterNode renders the pill.
 *   - tree mode (visual-review 2026-04-23) — also ClusterNode (tree-layout
 *     emits `kind: "cluster"`), now plumbed through tree-layout's edge
 *     retargeter.
 *   - dendrogram mode (visual-review 2026-04-23) — TreeFolderNode renders
 *     the same pill, plumbed through dendrogram-layout's edge retargeter.
 */
import { test, expect, type Page } from "@playwright/test";
import { waitForGraphReady } from "./helpers";

type Layout = "clusters" | "tree" | "dendrogram";

/**
 * Fresh page with the requested layout pre-selected via localStorage so
 * the right renderer is in play. Pattern matches cluster-bezier-edges.spec.ts.
 */
async function gotoFreshLayout(
  page: Page,
  layout: Layout,
  url = "/",
): Promise<void> {
  await page.addInitScript((l) => {
    try {
      window.localStorage.clear();
      window.sessionStorage.clear();
      window.localStorage.setItem("viva.viewStore.graphLayout", l);
    } catch {
      // private mode — ignore
    }
  }, layout);
  await page.goto(url);
}

// Backwards-compat alias for callers below.
async function gotoFreshClusters(page: Page, url = "/"): Promise<void> {
  await gotoFreshLayout(page, "clusters", url);
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

// Visual-review 2026-04-23 — same affordance must show in tree mode and
// dendrogram mode wherever a folder card hides intra-folder cross-refs.
// User: "the icon doesn't appear in tree mode huh?"
for (const layout of ["tree", "dendrogram"] as const) {
  test.describe(`Folder intra-edge badge — ${layout} mode`, () => {
    test(`default-collapsed top folders with intra edges show ↻ N pill`, async ({
      page,
    }) => {
      await gotoFreshLayout(page, layout, "/?graph=large");
      await waitForGraphReady(page);
      await page.waitForTimeout(800);

      // The `large` fixture's top folders have multiple intra-folder
      // cross-refs. Pick one — same testid as cluster mode (TreeFolderNode
      // mirrors ClusterNode's `cluster-${path}` testid + uses the same
      // `cluster-intra-badge-${path}` selector for the pill).
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

    test(`default fixture (no intra-folder edges) shows NO ↻ badge`, async ({
      page,
    }) => {
      await gotoFreshLayout(page, layout);
      await waitForGraphReady(page);
      await page.waitForTimeout(800);

      const badges = page.locator('[data-testid^="cluster-intra-badge-"]');
      expect(await badges.count()).toBe(0);
      const glyphs = page.locator("text=/↻/");
      expect(await glyphs.count()).toBe(0);
    });

    test(`expanding the folder removes the badge (edges become directly visible)`, async ({
      page,
    }) => {
      await gotoFreshLayout(page, layout, "/?graph=large");
      await waitForGraphReady(page);
      await page.waitForTimeout(800);

      // Pre-condition: the badge IS there while collapsed.
      await expect(page.getByTestId("cluster-intra-badge-top00")).toBeVisible();

      // Expand the folder. In dendrogram mode the click on a treeFolder
      // card flips the hierarchy store; in tree mode the cluster
      // containment box opens and the inner files (or sub-clusters)
      // become the visible endpoints — either way the self-loop count
      // for top00 drops to 0 and the badge clears.
      const top = page.getByTestId("cluster-top00");
      await top.evaluate((el) => (el as HTMLElement).click());
      await page.waitForTimeout(800);

      await expect(
        page.getByTestId("cluster-intra-badge-top00"),
      ).toHaveCount(0);
    });
  });
}
