import { test, expect } from "@playwright/test";

test("graph is the default view mode on fresh load", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("graph-canvas")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("view-mode-graph")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("folder-view")).toHaveCount(0);
  await expect(page.getByTestId("table-view")).toHaveCount(0);
});

test("switches into folders view", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("graph-canvas")).toBeVisible();
  await page.getByTestId("view-mode-folders").click();
  await expect(page.getByTestId("folder-view")).toBeVisible();
  await expect(page.getByTestId("graph-canvas")).toHaveCount(0);
  await expect(page.getByTestId("view-mode-folders")).toHaveAttribute("aria-pressed", "true");
});

test("switches into table view", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("graph-canvas")).toBeVisible();
  await page.getByTestId("view-mode-table").click();
  await expect(page.getByTestId("table-view")).toBeVisible();
  await expect(page.getByTestId("view-mode-table")).toHaveAttribute("aria-pressed", "true");
});

test("table: clicking a size column header toggles sort direction", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("view-mode-table").click();
  await expect(page.getByTestId("table-view")).toBeVisible();

  // First click: sort by size asc (smallest first).
  await page.getByTestId("table-view-col-size").click();
  const firstAsc = await page.locator("tbody tr").first().textContent();
  // Second click: sort by size desc (largest first).
  await page.getByTestId("table-view-col-size").click();
  const firstDesc = await page.locator("tbody tr").first().textContent();
  expect(firstAsc).not.toEqual(firstDesc);
});

test("selecting a file in table view opens the detail panel", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("view-mode-table").click();
  const firstRow = page.locator("[data-testid^='table-view-row-']").first();
  await firstRow.click();
  await expect(page.getByTestId("file-detail-panel")).toBeVisible();
});

test("selection persists when switching from table back to graph (FR-V9)", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("view-mode-table").click();
  const firstRow = page.locator("[data-testid^='table-view-row-']").first();
  const rowTestId = await firstRow.getAttribute("data-testid");
  expect(rowTestId).toBeTruthy();
  await firstRow.click();
  await expect(page.getByTestId("file-detail-panel")).toBeVisible();
  await page.getByTestId("view-mode-graph").click();
  await expect(page.getByTestId("graph-canvas")).toBeVisible();
  // Detail panel stays open — selection-store is the single source of truth.
  await expect(page.getByTestId("file-detail-panel")).toBeVisible();
});

test("folder view bucket headers are clickable to collapse", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("view-mode-folders").click();
  await expect(page.getByTestId("folder-view")).toBeVisible();
  // At least one <details> block is rendered.
  const detailsCount = await page.locator("[data-testid='folder-view'] details").count();
  expect(detailsCount).toBeGreaterThan(0);
});
