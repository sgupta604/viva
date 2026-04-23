/**
 * E2E coverage for the auto-open-detail-panel toggle.
 *
 * The toggle (toolbar pill labeled "panel") gates whether clicking a file
 * tile force-opens the FileDetailPanel. Selection, hover, and the focus-
 * revealed cross-ref palette must keep working in both states — only the
 * panel's auto-open behavior changes.
 *
 * `localStorage.clear()` runs before each test so persisted state from
 * earlier specs (or earlier runs) doesn't leak in. Same pattern other
 * persistence-aware specs use.
 */
import { test, expect } from "@playwright/test";
import { expandConfig, waitForGraphReady } from "./helpers";

// Clear persisted view-store keys ONCE before the very first navigation in
// each test so a previous run can't preload "false" into us. We use a
// flag-keyed init script (instead of clearing on every navigation) so the
// reload step in the persistence test correctly READS the value the test
// just wrote — addInitScript fires on every page load including reloads.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (window.sessionStorage.getItem("viva.test.cleared")) return;
    try {
      window.localStorage.removeItem("viva.viewStore.autoOpenDetailPanel");
      window.sessionStorage.setItem("viva.test.cleared", "1");
    } catch {
      /* private mode — best-effort */
    }
  });
});

test("default: clicking a tile opens the detail panel (historical behavior preserved)", async ({
  page,
}) => {
  await page.goto("/");
  await waitForGraphReady(page);
  await expandConfig(page);

  // Sanity: toggle starts in the on/checked state
  const toggle = page.getByTestId("detail-panel-toggle");
  await expect(toggle).toHaveAttribute("aria-checked", "true");

  const first = page.locator("[data-testid^='node-']").first();
  await first.click();
  await expect(page.getByTestId("file-detail-panel")).toBeVisible();
});

test("toggle off: clicking a tile selects + lights edges WITHOUT opening the panel", async ({
  page,
}) => {
  await page.goto("/");
  await waitForGraphReady(page);
  await expandConfig(page);

  // Flip the toggle off
  const toggle = page.getByTestId("detail-panel-toggle");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");

  // Clicking a tile must NOT open the panel...
  const first = page.locator("[data-testid^='node-']").first();
  await first.click();
  await expect(page.getByTestId("file-detail-panel")).not.toBeVisible();

  // ...but selection still applies. The selected file's tile gets the
  // ring-2 ring-blue-400 token from FileNode/TreeFileNode — verify by
  // reading the className. (Robust enough across cluster vs dendrogram
  // since both apply the same Tailwind ring classes via the `selected`
  // prop wired through GraphCanvas.)
  await expect(first).toHaveClass(/ring-2/);
  await expect(first).toHaveClass(/ring-blue-400/);
});

test("toggle persists across page reloads", async ({ page }) => {
  await page.goto("/");
  await waitForGraphReady(page);

  await page.getByTestId("detail-panel-toggle").click();
  await expect(page.getByTestId("detail-panel-toggle")).toHaveAttribute(
    "aria-checked",
    "false",
  );

  await page.reload();
  await waitForGraphReady(page);

  // The persisted "off" state survives the refresh — toggle still off.
  await expect(page.getByTestId("detail-panel-toggle")).toHaveAttribute(
    "aria-checked",
    "false",
  );

  // Belt-and-suspenders: clicking a tile after reload still suppresses the
  // panel, proving the gate read the persisted setting (not just rendered
  // its visual state).
  await expandConfig(page);
  const first = page.locator("[data-testid^='node-']").first();
  await first.click();
  await expect(page.getByTestId("file-detail-panel")).not.toBeVisible();
});

test("toggle back on: subsequent clicks resume opening the panel", async ({
  page,
}) => {
  await page.goto("/");
  await waitForGraphReady(page);
  await expandConfig(page);

  const toggle = page.getByTestId("detail-panel-toggle");

  // off
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  let first = page.locator("[data-testid^='node-']").first();
  await first.click();
  await expect(page.getByTestId("file-detail-panel")).not.toBeVisible();

  // on
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  first = page.locator("[data-testid^='node-']").first();
  await first.click();
  await expect(page.getByTestId("file-detail-panel")).toBeVisible();
});
