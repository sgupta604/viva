import { test, expect } from "@playwright/test";

test("Ctrl+K opens the search palette", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("graph-canvas")).toBeVisible();
  await page.keyboard.press("Control+k");
  await expect(page.getByTestId("search-input")).toBeVisible();
});

test("typing threshold finds at least one file and Enter selects it", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("graph-canvas")).toBeVisible();
  await page.keyboard.press("Control+k");
  const input = page.getByTestId("search-input");
  await input.fill("threshold");
  await expect(page.locator("[data-testid^='search-hit-']").first()).toBeVisible();
  await input.press("Enter");
  await expect(page.getByTestId("file-detail-panel")).toBeVisible();
});

test("Esc closes the palette", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("graph-canvas")).toBeVisible();
  await page.keyboard.press("Control+k");
  await expect(page.getByTestId("search-input")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("search-input")).not.toBeVisible();
});
