import { test, expect } from "@playwright/test";

test("hide-tests is on by default and toggle reveals tests", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("graph-canvas")).toBeVisible();
  const checkbox = page.getByTestId("filter-hide-tests");
  await expect(checkbox).toBeChecked();

  const initial = await page.locator("[data-testid^='node-']").count();
  await checkbox.uncheck();
  // Give layout a moment to recompute
  await page.waitForTimeout(200);
  const after = await page.locator("[data-testid^='node-']").count();
  expect(after).toBeGreaterThan(initial);
});

test("unchecking a kind filter removes those nodes", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("graph-canvas")).toBeVisible();
  const beforeAll = await page.locator("[data-testid^='node-']").count();
  await page.getByTestId("filter-kind-json").uncheck();
  await page.waitForTimeout(200);
  const afterJsonOff = await page.locator("[data-testid^='node-']").count();
  expect(afterJsonOff).toBeLessThan(beforeAll);
});
