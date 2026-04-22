/**
 * E2E helpers.
 *
 * The default canvas state on v2 is "top-level clusters collapsed" so file
 * nodes aren't in the DOM until a cluster is expanded. Tests that assert
 * file-level behavior (detail panel, keyboard, etc.) call `expandConfig()`
 * first to reveal the sample-module fixture's `config/` cluster (4+ xml files).
 */
import type { Page } from "@playwright/test";

export async function expandConfig(page: Page) {
  const cluster = page.getByTestId("cluster-config");
  await cluster.waitFor({ state: "visible" });
  await cluster.click();
  // Wait until at least one file node lands in the DOM.
  await page.waitForSelector("[data-testid^='node-']", { timeout: 5000 });
}
