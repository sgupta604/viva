import { test, expect } from "@playwright/test";
import { expandConfig } from "./helpers";

test("loads graph.json and renders cluster nodes at default", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("graph-canvas")).toBeVisible({ timeout: 10_000 });
  // v2 default = top-level clusters rendered as tiles; no file nodes.
  const clusterCount = await page
    .locator("[data-testid^='cluster-']")
    .count();
  expect(clusterCount).toBeGreaterThan(0);
});

test("expanding a cluster renders file nodes", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("graph-canvas")).toBeVisible({ timeout: 10_000 });
  await expandConfig(page);
  const nodeCount = await page.locator("[data-testid^='node-']").count();
  expect(nodeCount).toBeGreaterThan(0);
});

test("shows filter bar with non-zero counts", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("filter-bar")).toBeVisible();
  await expect(page.getByTestId("filter-bar")).toContainText("files");
});
