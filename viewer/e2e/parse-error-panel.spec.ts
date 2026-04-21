import { test, expect } from "@playwright/test";

/**
 * The committed fixture contains `config/broken.xml` (intentional parse
 * error with one recoverable param). These specs cover the FR-V7 /
 * FR-V8 affordances: inline error surface + "view raw anyway" + Monaco
 * plaintext fallback.
 */

test("broken file shows inline parse error in panel", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("view-mode-table").click();
  await expect(page.getByTestId("table-view")).toBeVisible();

  // Find the status-error cell from the Table view for broken.xml and click
  // the whole row. The row testid embeds the file id; we locate via path text.
  const brokenRow = page.locator("tbody tr").filter({ hasText: "broken.xml" }).first();
  await brokenRow.click();

  await expect(page.getByTestId("file-detail-panel")).toBeVisible();
  await expect(page.getByTestId("file-detail-panel")).toContainText("parse error");
});

test("'view raw anyway' flips to the raw tab", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("view-mode-table").click();
  await expect(page.getByTestId("table-view")).toBeVisible();

  const brokenRow = page.locator("tbody tr").filter({ hasText: "broken.xml" }).first();
  await brokenRow.click();
  await expect(page.getByTestId("file-detail-panel")).toBeVisible();

  // "view raw anyway" must be present on the panel (params tab).
  const viewRawButton = page.getByTestId("view-raw-anyway");
  await expect(viewRawButton).toBeVisible();

  await viewRawButton.click();
  // Either Monaco mounts with the plaintext content OR (if sources somehow
  // didn't mirror) the "source not shipped" fallback. In the standard fixture
  // setup, the mirror IS present, so we expect Monaco.
  await expect(
    page.getByTestId("raw-source-editor").or(page.getByTestId("raw-source-missing")),
  ).toBeVisible({ timeout: 15_000 });
});

test("xi-include file parses clean (no parse-error surface) — recover mode regression guard", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByTestId("view-mode-table").click();

  const xiRow = page.locator("tbody tr").filter({ hasText: "xi-include.xml" }).first();
  await xiRow.click();
  await expect(page.getByTestId("file-detail-panel")).toBeVisible();
  // No parse-error banner for xi-include under the recover-mode parser.
  await expect(page.getByTestId("file-detail-panel")).not.toContainText("parse error");
  // And no "view raw anyway" button either — it's only rendered on parseError.
  await expect(page.getByTestId("view-raw-anyway")).toHaveCount(0);
});
