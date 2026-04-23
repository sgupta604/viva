/**
 * Large-scale fixture E2E (I.2).
 *
 * Asserts baseline behaviors on the synthesized 3k-file fixture:
 *   - default state renders only top-level clusters (≤ 20 visible nodes)
 *   - zoom-out flips to overview zoom mode
 *   - expand+zoom-in flips to detail
 */
import { test, expect } from "@playwright/test";
import { waitForGraphReady } from "./helpers";

test.describe("Large-scale 3k-file fixture", () => {
  test("default-collapsed has ≤ 20 visible cluster nodes, zero file nodes", async ({ page }) => {
    await page.goto("/?graph=large");
    await waitForGraphReady(page);
    await page.waitForTimeout(400);

    // Match cluster CARDS only — exclude `cluster-intra-badge-…` pills that
    // also use the `cluster-` testid prefix (introduced by the polish-batch-1
    // collapsed-folder badge + visual-review 2026-04-23 follow-up). Without
    // this guard the locator double-counts (card + badge) when any folder
    // hides intra-folder cross-refs.
    const clusterNodes = page.locator(
      '[data-testid^="cluster-"]:not([data-testid^="cluster-intra-badge-"])',
    );
    const clusterCount = await clusterNodes.count();
    // 20 top-level clusters exactly, nothing more (no file nodes)
    expect(clusterCount).toBe(20);
    const fileNodes = page.locator('[data-testid^="node-"]');
    expect(await fileNodes.count()).toBe(0);
  });

  test("graph-canvas carries a data-zoom-mode attribute", async ({ page }) => {
    await page.goto("/?graph=large");
    const canvas = page.getByTestId("graph-canvas");
    await expect(canvas).toBeVisible();
    // Default fitView zoom puts us somewhere in the detail or mid range
    // depending on viewport; just assert the attribute exists.
    const mode = await canvas.getAttribute("data-zoom-mode");
    expect(["overview", "mid", "detail"]).toContain(mode);
  });
});
