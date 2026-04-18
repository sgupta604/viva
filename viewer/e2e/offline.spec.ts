import { test, expect } from "@playwright/test";

test("no external requests are made during startup", async ({ page, baseURL }) => {
  const pageOrigin = new URL(baseURL ?? "http://localhost:4173").origin;
  const violations: string[] = [];
  page.on("request", (req) => {
    const url = req.url();
    if (url.startsWith("data:") || url.startsWith("blob:")) return;
    if (url.startsWith("chrome-extension://") || url.startsWith("devtools://")) return;
    try {
      const origin = new URL(url).origin;
      if (origin !== pageOrigin) violations.push(url);
    } catch {
      // non-URL; ignore
    }
  });

  await page.goto("/");
  await expect(page.getByTestId("graph-canvas")).toBeVisible();

  // Interact a bit so any lazy chunks load
  await page.keyboard.press("Control+k");
  await page.getByTestId("search-input").fill("radar");
  await page.getByTestId("search-input").press("Enter");
  await expect(page.getByTestId("file-detail-panel")).toBeVisible();

  // Force the Monaco chunk to load too — it is the most likely offender via
  // `@monaco-editor/react`'s default jsdelivr loader.
  await page.getByTestId("tab-raw").click();
  await expect(
    page.getByTestId("raw-source-editor").or(page.getByTestId("raw-source-missing")),
  ).toBeVisible({ timeout: 15_000 });
  // Give Monaco a moment to settle after mount.
  await page.waitForTimeout(500);

  expect(violations, `external requests detected: ${violations.join(", ")}`).toHaveLength(0);
});
