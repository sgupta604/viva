/**
 * Visual evidence for the intra-edge badge fix in tree + dendrogram modes
 * (visual-review 2026-04-23 follow-up to polish-batch-1 item 1).
 *
 * The badge previously rendered only on `ClusterNode` collapsed cards in
 * cluster mode. User: "the icon doesn't appear in tree mode huh?". This
 * spec captures the badge in BOTH flat modes so the same hidden-edge
 * affordance surfaces wherever a folder card hides intra-folder cross-refs.
 *
 * Captures 4 screenshots:
 *   - tree mode collapsed (positive — badge SHOULD appear on folders with
 *     hidden intra-folder edges)
 *   - tree mode expanded (badge gone — edges visible directly)
 *   - dendrogram mode collapsed (positive)
 *   - dendrogram mode expanded (badge gone)
 *
 * Cluster-mode coverage stays in cluster-intra-badge.spec.ts; this file
 * deliberately mirrors that test's structure for the flat modes.
 */
import { test, type Page } from "@playwright/test";
import { waitForGraphReady } from "./helpers";

async function gotoFreshLayout(
  page: Page,
  layout: "tree" | "dendrogram",
  url = "/?graph=large",
): Promise<void> {
  await page.addInitScript((l) => {
    try {
      window.localStorage.clear();
      window.sessionStorage.clear();
      window.localStorage.setItem("viva.viewStore.graphLayout", l);
    } catch {
      /* ignore */
    }
  }, layout);
  await page.goto(url);
}

test("screenshot: tree mode collapsed shows ↻ badge on folders with intra edges", async ({
  page,
}) => {
  await gotoFreshLayout(page, "tree");
  await waitForGraphReady(page);
  await page.waitForTimeout(800);
  await page.screenshot({
    path: "test-results/screenshots/tree-badge-01-collapsed.png",
    fullPage: false,
  });
});

test("screenshot: tree mode expanded — badge gone (edges visible directly)", async ({
  page,
}) => {
  await gotoFreshLayout(page, "tree");
  await waitForGraphReady(page);
  // Expand the first top cluster so its intra-cluster edges become
  // direct file→file edges and the badge clears.
  const top = page.getByTestId("cluster-top00");
  await top.evaluate((el) => (el as HTMLElement).click());
  await page.waitForTimeout(800);
  await page.screenshot({
    path: "test-results/screenshots/tree-badge-02-expanded.png",
    fullPage: false,
  });
});

test("screenshot: dendrogram mode collapsed shows ↻ badge on folders with intra edges", async ({
  page,
}) => {
  await gotoFreshLayout(page, "dendrogram");
  await waitForGraphReady(page);
  await page.waitForTimeout(800);
  await page.screenshot({
    path: "test-results/screenshots/tree-badge-03-dendrogram-collapsed.png",
    fullPage: false,
  });
});

test("screenshot: dendrogram mode expanded — badge gone", async ({ page }) => {
  await gotoFreshLayout(page, "dendrogram");
  await waitForGraphReady(page);
  const top = page.getByTestId("cluster-top00");
  await top.evaluate((el) => (el as HTMLElement).click());
  await page.waitForTimeout(800);
  await page.screenshot({
    path: "test-results/screenshots/tree-badge-04-dendrogram-expanded.png",
    fullPage: false,
  });
});
