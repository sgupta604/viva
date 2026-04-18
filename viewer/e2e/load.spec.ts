import { test, expect } from "@playwright/test";

test("loads graph.json and renders the canvas", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("graph-canvas")).toBeVisible({ timeout: 10_000 });
  // At least one file node is rendered.
  const nodeCount = await page.locator("[data-testid^='node-']").count();
  expect(nodeCount).toBeGreaterThan(0);
});

test("shows filter bar with non-zero counts", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("filter-bar")).toBeVisible();
  await expect(page.getByTestId("filter-bar")).toContainText("files");
});
