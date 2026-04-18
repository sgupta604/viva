import { test, expect } from "@playwright/test";

test("Escape closes both palette and panel", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("graph-canvas")).toBeVisible();
  await page.keyboard.press("Control+k");
  await expect(page.getByTestId("search-input")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("search-input")).not.toBeVisible();

  const first = page.locator("[data-testid^='node-']").first();
  await first.click();
  await expect(page.getByTestId("file-detail-panel")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("file-detail-panel")).not.toBeVisible();
});
