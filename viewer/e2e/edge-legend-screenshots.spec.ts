/**
 * Visual evidence for the legend-position fix (visual-review 2026-04-23).
 *
 * Captures 4 screenshots covering the bug repros + steady states. NOT a
 * regression test — assertions are intentionally minimal so the user can
 * eyeball the captures even when an upstream layout change shifts pixels.
 * The strict assertions live in `edge-legend-position.spec.ts`.
 */
import { test } from "@playwright/test";
import { expandConfig, waitForGraphReady } from "./helpers";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      window.localStorage.removeItem("viva.viewStore.autoOpenDetailPanel");
    } catch {
      /* ignore */
    }
  });
});

test("screenshot: legend at default 12px (no panel)", async ({ page }) => {
  await page.goto("/");
  await waitForGraphReady(page);
  await expandConfig(page);
  await page.waitForTimeout(300);
  await page.screenshot({
    path: "test-results/screenshots/legend-01-default.png",
    fullPage: false,
  });
});

test("screenshot: legend slides to 416px (panel open, positive case)", async ({
  page,
}) => {
  await page.goto("/");
  await waitForGraphReady(page);
  await expandConfig(page);
  const first = page.locator("[data-testid^='node-']").first();
  await first.click();
  await page.waitForTimeout(300);
  await page.screenshot({
    path: "test-results/screenshots/legend-02-panel-open.png",
    fullPage: false,
  });
});

test("screenshot: auto-open OFF + click file → legend stays at 12px (Bug #1 fix)", async ({
  page,
}) => {
  await page.goto("/");
  await waitForGraphReady(page);
  await page.getByTestId("detail-panel-toggle").click();
  await expandConfig(page);
  const first = page.locator("[data-testid^='node-']").first();
  await first.click();
  await page.waitForTimeout(300);
  await page.screenshot({
    path: "test-results/screenshots/legend-03-autoopen-off.png",
    fullPage: false,
  });
});

test("screenshot: manual X close → legend snaps back to 12px (Bug #2 fix)", async ({
  page,
}) => {
  await page.goto("/");
  await waitForGraphReady(page);
  await expandConfig(page);
  const first = page.locator("[data-testid^='node-']").first();
  await first.click();
  await page.waitForTimeout(300);
  // Confirm visible, then close via X
  await page.getByLabel("close details").click();
  await page.waitForTimeout(300);
  await page.screenshot({
    path: "test-results/screenshots/legend-04-manual-close.png",
    fullPage: false,
  });
});
