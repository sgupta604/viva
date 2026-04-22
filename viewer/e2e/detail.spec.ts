import { test, expect } from "@playwright/test";
import { expandConfig, waitForGraphReady } from "./helpers";

test("clicking a file node opens the detail panel", async ({ page }) => {
  await page.goto("/");
  await waitForGraphReady(page);
  await expandConfig(page);
  const first = page.locator("[data-testid^='node-']").first();
  await first.click();
  await expect(page.getByTestId("file-detail-panel")).toBeVisible();
});

test("Esc closes the detail panel", async ({ page }) => {
  await page.goto("/");
  await waitForGraphReady(page);
  await expandConfig(page);
  const first = page.locator("[data-testid^='node-']").first();
  await first.click();
  await expect(page.getByTestId("file-detail-panel")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("file-detail-panel")).not.toBeVisible();
});

test("Raw tab lazy-loads source or shows missing placeholder", async ({ page }) => {
  await page.goto("/");
  await waitForGraphReady(page);
  await expandConfig(page);
  const first = page.locator("[data-testid^='node-']").first();
  await first.click();
  await page.getByTestId("tab-raw").click();
  await expect(
    page.getByTestId("raw-source-editor").or(page.getByTestId("raw-source-missing")),
  ).toBeVisible({ timeout: 10_000 });
});
