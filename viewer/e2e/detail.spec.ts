import { test, expect } from "@playwright/test";

test("clicking a file node opens the detail panel", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("graph-canvas")).toBeVisible();
  const first = page.locator("[data-testid^='node-']").first();
  await first.click();
  await expect(page.getByTestId("file-detail-panel")).toBeVisible();
});

test("Esc closes the detail panel", async ({ page }) => {
  await page.goto("/");
  const first = page.locator("[data-testid^='node-']").first();
  await first.click();
  await expect(page.getByTestId("file-detail-panel")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("file-detail-panel")).not.toBeVisible();
});

test("Raw tab lazy-loads source or shows missing placeholder", async ({ page }) => {
  await page.goto("/");
  const first = page.locator("[data-testid^='node-']").first();
  await first.click();
  await page.getByTestId("tab-raw").click();
  await expect(
    page.getByTestId("raw-source-editor").or(page.getByTestId("raw-source-missing")),
  ).toBeVisible({ timeout: 10_000 });
});
