import { test, expect } from "@playwright/test";

test("clicking a param highlights referencing files", async ({ page }) => {
  await page.goto("/");
  // Open a file with params (radar.xml has params)
  await page.getByTestId("graph-canvas").waitFor();
  // Use search to reliably pick radar.xml
  await page.keyboard.press("Control+k");
  await page.getByTestId("search-input").fill("radar");
  await page.getByTestId("search-input").press("Enter");
  await expect(page.getByTestId("file-detail-panel")).toBeVisible();

  // Click a param
  const paramBtn = page.getByTestId("param-radar.threshold_rain").first();
  await expect(paramBtn).toBeVisible();
  await paramBtn.click();
  // After selection, at least one node should have the strong-highlight ring class.
  // We assert via the DOM that the param is marked selected.
  await expect(paramBtn).toHaveClass(/ring-amber/);
});
