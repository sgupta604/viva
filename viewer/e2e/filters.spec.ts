/**
 * Filter bar E2E (I.3).
 *
 * After V.7, folder dropdown becomes NAVIGATE (expandToPath + fitView) —
 * it no longer strips sibling clusters. Kind + hide-tests checkboxes still
 * HIDE, but operate on files within the currently-visible (expanded) set.
 */
import { test, expect } from "@playwright/test";
import { expandCluster, waitForGraphReady } from "./helpers";

async function expandAllTopClusters(page: import("@playwright/test").Page) {
  // Top-level clusters in sample-module: config, dangling, environments,
  // pipelines, shared, tests, thresholds.
  for (const folder of [
    "config",
    "dangling",
    "environments",
    "pipelines",
    "shared",
    "tests",
    "thresholds",
  ]) {
    const sel = page.getByTestId(`cluster-${folder}`);
    if (await sel.count()) await expandCluster(page, folder);
  }
  await page.waitForTimeout(300);
}

test("default load has all top-level folder clusters collapsed; zero file nodes visible", async ({ page }) => {
  await page.goto("/");
  await waitForGraphReady(page);
  await page.waitForTimeout(300);
  // Auto-retrying assertion: the async dendrogram layout needs to settle on
  // a cold ELK worker before we sample the DOM, and a one-shot count() can
  // race the worker round-trip on slow runners.
  await expect(page.locator("[data-testid^='node-']")).toHaveCount(0);
});

test("expanding a cluster reveals its files", async ({ page }) => {
  await page.goto("/");
  await waitForGraphReady(page);
  await expandCluster(page, "config");
  // config/ contains 4+ parseable xml files — wait for at least one to land
  // in the DOM rather than racing the async layout with a one-shot count().
  await expect(page.locator("[data-testid^='node-']").first()).toBeVisible();
});

test("hide-tests is on by default; unchecking reveals test files once expanded", async ({ page }) => {
  await page.goto("/");
  await waitForGraphReady(page);
  await expect(page.getByTestId("filter-hide-tests")).toBeChecked();
  await expandAllTopClusters(page);
  const initial = await page.locator("[data-testid^='node-']").count();
  await page.getByTestId("filter-hide-tests").uncheck();
  await page.waitForTimeout(300);
  const after = await page.locator("[data-testid^='node-']").count();
  expect(after).toBeGreaterThan(initial);
});

test("unchecking a kind filter removes those nodes once visible", async ({ page }) => {
  await page.goto("/");
  await waitForGraphReady(page);
  await expandAllTopClusters(page);
  const beforeAll = await page.locator("[data-testid^='node-']").count();
  await page.getByTestId("filter-kind-json").uncheck();
  await page.waitForTimeout(300);
  const afterJsonOff = await page.locator("[data-testid^='node-']").count();
  expect(afterJsonOff).toBeLessThan(beforeAll);
});

test("jump-to-folder NAVIGATES: sibling clusters remain in DOM (NAVIGATE not HIDE)", async ({ page }) => {
  await page.goto("/");
  await waitForGraphReady(page);
  await page.waitForTimeout(300);
  // Pick a specific folder — the dropdown option list comes from
  // graph.clusters
  await page.getByTestId("filter-folder").selectOption("config");
  await page.waitForTimeout(300);
  // `config` cluster should be expanded (data-expanded=true)
  await expect(page.getByTestId("cluster-config")).toHaveAttribute("data-expanded", "true");
  // Sibling clusters still present (collapsed, but in DOM) — this is the
  // key regression test: NAVIGATE does NOT strip context.
  await expect(page.getByTestId("cluster-shared")).toBeVisible();
  await expect(page.getByTestId("cluster-pipelines")).toBeVisible();
});

test("jump-to-folder '(all)' collapses everything back to top level", async ({ page }) => {
  await page.goto("/");
  await waitForGraphReady(page);
  await page.waitForTimeout(300);
  // Expand something first
  await expandCluster(page, "config");
  await page.waitForTimeout(200);
  await expect(page.getByTestId("cluster-config")).toHaveAttribute("data-expanded", "true");
  // Now choose "(all)" → collapseAll
  await page.getByTestId("filter-folder").selectOption("");
  await page.waitForTimeout(300);
  // Zero file nodes (everything collapsed). Auto-retrying so the async
  // dendrogram layout has time to settle on cold ELK workers — a one-shot
  // `expect(await locator.count()).toBe(0)` raced the worker round-trip.
  await expect(page.locator("[data-testid^='node-']")).toHaveCount(0);
});
