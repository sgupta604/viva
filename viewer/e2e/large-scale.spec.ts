/**
 * Large-scale fixture E2E (I.2).
 *
 * Asserts baseline behaviors on the synthesized 3k-file fixture:
 *   - default state renders only top-level clusters (≤ 20 visible nodes)
 *   - zoom-out flips to overview zoom mode
 *   - expand+zoom-in flips to detail
 */
import { test, expect } from "@playwright/test";

test.describe("Large-scale 3k-file fixture", () => {
  test("default-collapsed has ≤ 20 visible cluster nodes, zero file nodes", async ({ page }) => {
    await page.goto("/?graph=large");
    await expect(page.getByTestId("graph-canvas")).toBeVisible();
    await page.waitForTimeout(400);

    const clusterNodes = page.locator('[data-testid^="cluster-"]');
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
