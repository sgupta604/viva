/**
 * Edge legend position — regression for visual-review 2026-04-23 bugs.
 *
 * The legend slides left to clear the FileDetailPanel ONLY when the panel
 * is actually open. Two bugs the user spotted in the polish-batch-1 visual
 * review motivated this spec:
 *
 *   1. With the auto-open-detail-panel toggle OFF, clicking a file tile
 *      updates selection but does NOT open the panel — the legend used to
 *      slide anyway because it keyed off `selectedFileId`. Now it keys off
 *      `detailPanelOpen` and stays put.
 *
 *   2. After the user manually closed the panel via its X button,
 *      `selectedFileId` was still set so the legend stayed slid out into
 *      empty space. Same root cause; same fix.
 *
 * Each test reproduces the exact symptom path so a future regression
 * fails the visible bug, not just the unit test.
 */
import { test, expect } from "@playwright/test";
import { expandConfig, waitForGraphReady } from "./helpers";

test.beforeEach(async ({ page }) => {
  // Reset persisted state so the auto-open toggle starts in a known
  // position. Same pattern detail-panel-toggle.spec.ts uses.
  await page.addInitScript(() => {
    if (window.sessionStorage.getItem("viva.test.cleared.legend")) return;
    try {
      window.localStorage.removeItem("viva.viewStore.autoOpenDetailPanel");
      window.sessionStorage.setItem("viva.test.cleared.legend", "1");
    } catch {
      /* private mode — best-effort */
    }
  });
});

test("auto-open OFF + click file: legend stays at default 12px (panel never opens)", async ({
  page,
}) => {
  await page.goto("/");
  await waitForGraphReady(page);

  // Flip auto-open off BEFORE expanding so the very first file click
  // exercises the suppression path.
  const toggle = page.getByTestId("detail-panel-toggle");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");

  await expandConfig(page);

  // Steady state — legend at 12px, panel-open marker false.
  const legend = page.getByTestId("edge-legend");
  await expect(legend).toHaveAttribute("data-panel-open", "false");
  await expect(legend).toHaveCSS("right", "12px");

  // Click a file. Selection updates; panel does NOT open (toggle is off).
  const first = page.locator("[data-testid^='node-']").first();
  await first.click();
  await expect(page.getByTestId("file-detail-panel")).not.toBeVisible();

  // The bug was: legend slid to 416px even though no panel rendered.
  // Fix: legend stays put.
  await expect(legend).toHaveAttribute("data-panel-open", "false");
  await expect(legend).toHaveCSS("right", "12px");
});

test("manual close via X: legend snaps back to 12px even though selection persists", async ({
  page,
}) => {
  await page.goto("/");
  await waitForGraphReady(page);
  await expandConfig(page);

  // Default toggle ON — clicking a file opens the panel and the legend
  // slides to 416px.
  const first = page.locator("[data-testid^='node-']").first();
  await first.click();
  await expect(page.getByTestId("file-detail-panel")).toBeVisible();
  const legend = page.getByTestId("edge-legend");
  await expect(legend).toHaveAttribute("data-panel-open", "true");
  await expect(legend).toHaveCSS("right", "416px");

  // Close the panel via its X button. selectedFileId remains set (so the
  // tile keeps its ring), but detailPanelOpen flips to false. Legend
  // MUST snap back.
  await page.getByLabel("close details").click();
  await expect(page.getByTestId("file-detail-panel")).not.toBeVisible();
  await expect(legend).toHaveAttribute("data-panel-open", "false");
  await expect(legend).toHaveCSS("right", "12px");
});

test("auto-open ON + click file: legend slides to 416px (positive case)", async ({
  page,
}) => {
  await page.goto("/");
  await waitForGraphReady(page);
  await expandConfig(page);

  // Sanity — toggle starts on.
  await expect(page.getByTestId("detail-panel-toggle")).toHaveAttribute(
    "aria-checked",
    "true",
  );

  const legend = page.getByTestId("edge-legend");
  await expect(legend).toHaveCSS("right", "12px");

  const first = page.locator("[data-testid^='node-']").first();
  await first.click();
  await expect(page.getByTestId("file-detail-panel")).toBeVisible();
  await expect(legend).toHaveAttribute("data-panel-open", "true");
  await expect(legend).toHaveCSS("right", "416px");
});
