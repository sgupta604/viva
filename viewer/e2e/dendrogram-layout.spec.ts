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
