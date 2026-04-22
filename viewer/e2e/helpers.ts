/**
 * E2E helpers.
 *
 * The default canvas state on v2 is "top-level clusters collapsed" so file
 * nodes aren't in the DOM until a cluster is expanded. Tests that assert
 * file-level behavior (detail panel, keyboard, etc.) call `expandConfig()`
 * first to reveal the sample-module fixture's `config/` cluster (4+ xml files).
 *
 * Post tree-layout-redesign (diagnosis 2026-04-22): the GraphCanvas now
 * renders a skeleton with `data-testid="graph-canvas" data-loading="true"`
 * while the elkjs worker computes the initial layout. Tests that race on
 * `getByTestId("graph-canvas").toBeVisible()` were finding the skeleton
 * (which IS visible) and immediately querying for cluster/file nodes that
 * hadn't been added to the DOM yet. `waitForGraphReady()` blocks until the
 * `data-loading` attribute flips to `"false"`, guaranteeing layout has
 * completed. Use this in place of (or alongside) the bare visibility check.
 */
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

/**
 * Wait until the GraphCanvas has finished its first layout pass. Returns
 * immediately for sync (cluster) layout; blocks ≤10s for async (tree/elk)
 * layout. Safe to call after `page.goto()` or after a layout-mode toggle.
 */
export async function waitForGraphReady(page: Page, timeout = 10_000) {
  await expect(page.getByTestId("graph-canvas")).toBeVisible({ timeout });
  await expect(page.getByTestId("graph-canvas")).toHaveAttribute(
    "data-loading",
    "false",
    { timeout },
  );
}

export async function expandConfig(page: Page) {
  await waitForGraphReady(page);
  await expandCluster(page, "config");
  // Wait until at least one file node lands in the DOM.
  await page.waitForSelector("[data-testid^='node-']", { timeout: 5000 });
}

/**
 * Click a cluster header to toggle its expanded state. Uses an in-page
 * `el.click()` dispatch instead of Playwright's `locator.click()` because
 * config edges are rendered with `zIndex: 1000` (deliberate — see
 * GraphCanvas edge-zIndex comment) so React Flow's edge-interaction SVG
 * paths sit ABOVE cluster fills and intercept Playwright's geometric
 * pointer-event hit-test. The user-facing experience is correct (the
 * browser routes the bubbled click to the cluster's React handler); only
 * Playwright's strict actionability check is too conservative.
 *
 * Calling `el.click()` from `evaluate` bypasses Playwright's hit-test and
 * dispatches the click event directly to the cluster wrapper, so React's
 * synthetic-event delegation routes it to the cluster's onClick.
 */
export async function expandCluster(page: Page, clusterPath: string) {
  const cluster = page.getByTestId(`cluster-${clusterPath}`);
  await cluster.waitFor({ state: "visible" });
  await cluster.evaluate((el) => (el as HTMLElement).click());
  await page.waitForTimeout(150); // give Zustand+React a beat to re-render
}
