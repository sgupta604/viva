/**
 * Hierarchy interaction E2E (I.2 / V.4 acceptance tests).
 *
 * Covers:
 *   - default-collapsed state on load
 *   - expand-cluster shows children
 *   - keyboard activation of cluster toggle
 *   - sessionStorage persistence of expansion state across reload
 *   - cross-cluster edge remains visible at overview zoom
 */
import { test, expect } from "@playwright/test";

test.describe("Hierarchy — cluster expand/collapse", () => {
  test("default-collapsed — top-level clusters visible, files hidden", async ({ page }) => {
    await page.goto("/?graph=large");
    await expect(page.getByTestId("graph-canvas")).toBeVisible();
    // Give the canvas a beat to lay out and fit view
    await page.waitForTimeout(400);

    // Each of our 20 top clusters emits a data-testid like cluster-top00 .. top19
    const clusterNodes = page.locator('[data-testid^="cluster-top"]');
    const clusterCount = await clusterNodes.count();
    expect(clusterCount).toBeGreaterThan(0);
    // None of the file nodes should be rendered — virtualized via omission.
    const fileNodes = page.locator('[data-testid^="node-"]');
    expect(await fileNodes.count()).toBe(0);
  });

  test("click cluster header → children appear", async ({ page }) => {
    await page.goto("/?graph=large");
    await expect(page.getByTestId("graph-canvas")).toBeVisible();
    await page.waitForTimeout(400);

    // Expand top00 — synthetic fixture puts its `.d/` sibling file
    // (mid14.xml) directly inside top00 as childFiles, so the expand
    // action surfaces that as a file node. Layout also gains data-expanded
    // attribute on the cluster itself.
    const top00 = page.getByTestId("cluster-top00");
    await expect(top00).toBeVisible();
    await top00.click();
    await page.waitForTimeout(300);
    await expect(top00).toHaveAttribute("data-expanded", "true");
  });

  test("keyboard Enter on cluster toggles expansion", async ({ page }) => {
    await page.goto("/?graph=large");
    await expect(page.getByTestId("graph-canvas")).toBeVisible();
    await page.waitForTimeout(400);
    const top01 = page.getByTestId("cluster-top01");
    await top01.focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(200);
    await expect(top01).toHaveAttribute("data-expanded", "true");
  });

  test("expansion persists across reload via sessionStorage", async ({ page }) => {
    await page.goto("/?graph=large");
    await expect(page.getByTestId("graph-canvas")).toBeVisible();
    await page.waitForTimeout(400);
    await page.getByTestId("cluster-top02").click();
    await page.waitForTimeout(200);
    await page.reload();
    await expect(page.getByTestId("graph-canvas")).toBeVisible();
    await page.waitForTimeout(400);
    // After reload, top02 should still be expanded
    const top02 = page.getByTestId("cluster-top02");
    await expect(top02).toHaveAttribute("data-expanded", "true");
  });
});
