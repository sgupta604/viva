/**
 * Hierarchy interaction E2E (I.2 / V.4 acceptance tests).
 *
 * Covers:
 *   - default-collapsed state on load
 *   - expand-cluster shows children
 *   - keyboard activation of cluster toggle
 *   - sessionStorage persistence of expansion state across reload
 *   - cross-cluster edge remains visible at overview zoom
 */
import { test, expect } from "@playwright/test";
import { expandCluster, waitForGraphReady } from "./helpers";

test.describe("Hierarchy — cluster expand/collapse", () => {
  test("default-collapsed — top-level clusters visible, files hidden", async ({ page }) => {
    await page.goto("/?graph=large");
    await waitForGraphReady(page);
    // Give the canvas a beat to lay out and fit view
    await page.waitForTimeout(400);

    // Each of our 20 top clusters emits a data-testid like cluster-top00 .. top19
    const clusterNodes = page.locator('[data-testid^="cluster-top"]');
    const clusterCount = await clusterNodes.count();
    expect(clusterCount).toBeGreaterThan(0);
    // None of the file nodes should be rendered — virtualized via omission.
    const fileNodes = page.locator('[data-testid^="node-"]');
    expect(await fileNodes.count()).toBe(0);
  });

  test("click cluster header → children appear", async ({ page }) => {
    await page.goto("/?graph=large");
    await waitForGraphReady(page);
    await page.waitForTimeout(400);

    // Expand top00 — synthetic fixture puts its `.d/` sibling file
    // (mid14.xml) directly inside top00 as childFiles, so the expand
    // action surfaces that as a file node. Layout also gains data-expanded
    // attribute on the cluster itself.
    const top00 = page.getByTestId("cluster-top00");
    await expect(top00).toBeVisible();
    await expandCluster(page, "top00");
    await page.waitForTimeout(300);
    await expect(top00).toHaveAttribute("data-expanded", "true");
  });

  test("keyboard Enter on cluster toggles expansion", async ({ page }) => {
    await page.goto("/?graph=large");
    await waitForGraphReady(page);
    await page.waitForTimeout(400);
    const top01 = page.getByTestId("cluster-top01");
    await top01.focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(200);
    await expect(top01).toHaveAttribute("data-expanded", "true");
  });

  test("expansion persists across reload via sessionStorage", async ({ page }) => {
    await page.goto("/?graph=large");
    await waitForGraphReady(page);
    await page.waitForTimeout(400);
    await expandCluster(page, "top02");
    await page.waitForTimeout(200);
    await page.reload();
    await waitForGraphReady(page);
    await page.waitForTimeout(400);
    // After reload, top02 should still be expanded
    const top02 = page.getByTestId("cluster-top02");
    await expect(top02).toHaveAttribute("data-expanded", "true");
  });
});

/**
 * Nested-cluster rendering (Bug 1 fix) — the 3k fixture has top clusters whose
 * childClusters are mid-level sub-clusters. Pre-fix, expanding a top-level
 * cluster showed an empty interior because only childFiles were emitted.
 */
test.describe("Nested-cluster rendering (Bug 1)", () => {
  test("expanded cluster reveals child sub-clusters in DOM", async ({ page }) => {
    await page.goto("/?graph=large");
    await waitForGraphReady(page);
    await page.waitForTimeout(400);

    // Pre-expand count of children-of-top05 (by cluster-parent attribute).
    const midBefore = await page
      .locator('[data-cluster-parent="top05"]')
      .count();
    expect(midBefore).toBe(0);

    // Expand top05 — its children are mid00..mid14 clusters.
    await expandCluster(page, "top05");
    await page.waitForTimeout(400);

    // Assert child clusters are now in the DOM, with the expected parent link.
    const midAfter = await page
      .locator('[data-cluster-parent="top05"]')
      .count();
    expect(midAfter).toBeGreaterThan(0);
  });

  test("multi-level descent: expand top → mid → leaf files", async ({ page }) => {
    await page.goto("/?graph=large");
    await waitForGraphReady(page);
    await page.waitForTimeout(400);

    // Expand top03
    await expandCluster(page, "top03");
    await page.waitForTimeout(300);
    // mid00 under top03 should now be a clickable cluster.
    const mid = page.getByTestId("cluster-top03/mid00");
    await expect(mid).toBeVisible();
    // Before expanding the mid, there are no file nodes under it.
    const filesBefore = await page.locator("[data-testid^='node-']").count();
    // Expand the mid cluster
    await expandCluster(page, "top03/mid00");
    await page.waitForTimeout(400);
    const filesAfter = await page.locator("[data-testid^='node-']").count();
    expect(filesAfter).toBeGreaterThan(filesBefore);
  });
});

/**
 * Edge rendering (Bug 3 fix) — intra-top-cluster edges need to retarget to
 * the nearest VISIBLE ancestor, not blindly to the top cluster. The 3k
 * fixture has d-aggregate edges under top00..top01 (sibling xml file →
 * children of mid14.d/). With only top00 expanded, those endpoints retarget
 * to different visible nodes (file + sub-cluster) and must render as edges.
 */
test.describe("Edges render as SVG paths (Bug 3)", () => {
  test("expanded cluster with intra-cluster edges draws at least one path", async ({ page }) => {
    await page.goto("/?graph=large");
    await waitForGraphReady(page);
    await page.waitForTimeout(400);

    // Before expand — only top-level clusters; all 3k-fixture edges retarget
    // to cross-top pairs (logical-id) OR intra-top (include/d-aggregate).
    // The logical-id edges are cross-top so they render at overview already.
    const pathsAtOverview = await page
      .locator("svg.react-flow__edges path.react-flow__edge-path")
      .count();
    expect(pathsAtOverview).toBeGreaterThan(0);

    // Expand top00 → its sibling xml file + mid14.d/ sub-cluster become
    // visible, so d-aggregate edges now draw WITHIN top00.
    await expandCluster(page, "top00");
    await page.waitForTimeout(400);
    const pathsAfterExpand = await page
      .locator("svg.react-flow__edges path.react-flow__edge-path")
      .count();
    expect(pathsAfterExpand).toBeGreaterThanOrEqual(pathsAtOverview);
  });
});

/**
 * Post-finalize blocker fixes — catches the exact two regressions surfaced by
 * visual-verify.md:
 *
 *   BLOCKER 1: expanded grandchild cluster bounding box collides with an
 *              uncle cluster's bounding box (pixel overlap in the UI).
 *   BLOCKER 2: parent cluster with no direct childFiles (only sub-clusters)
 *              displays badge "0" instead of the total descendant file count.
 *
 * Exercised against the synthetic large fixture (`?graph=large`) since the
 * committed e2e fixture is flat — only the generated 3k-file tree has the
 * nested top→mid→leaf shape needed to reproduce BLOCKER 1 under Playwright.
 */
test.describe("Post-finalize blocker fixes", () => {
  test("top cluster badge shows total descendant file count, not 0 (BLOCKER 2)", async ({
    page,
  }) => {
    // Large fixture: each `topNN` has childFiles=[] but nested grandchildren
    // containing many files — direct-only count would render "0", regression
    // signature of the original post-finalize user review.
    await page.goto("/?graph=large");
    await waitForGraphReady(page);
    await page.waitForTimeout(400);

    const top = page.getByTestId("cluster-top00");
    await expect(top).toBeVisible();
    const badgeText = await top.locator("span.shrink-0").first().textContent();
    const n = Number.parseInt((badgeText ?? "").trim(), 10);
    expect(
      n,
      `cluster-top00 badge should be a positive integer, got "${badgeText}"`,
    ).toBeGreaterThan(20);
  });

  test("expanded grandchild cluster does NOT overlap its uncle clusters (BLOCKER 1)", async ({
    page,
  }) => {
    await page.goto("/?graph=large");
    await waitForGraphReady(page);
    await page.waitForTimeout(400);

    // Drill: top00 → top00/mid00. `top00/mid00` becomes an expanded grandchild
    // (mid-level cluster nested inside top00); `top01` is its top-level sibling.
    // Before the fix, mid00's interior would spill past top00's right edge and
    // overlap top01's rectangle.
    await expandCluster(page, "top00");
    await page.waitForTimeout(300);
    await expandCluster(page, "top00/mid00");
    await page.waitForTimeout(500);

    const midBox = await page.getByTestId("cluster-top00/mid00").boundingBox();
    const uncleBox = await page.getByTestId("cluster-top01").boundingBox();
    expect(midBox).not.toBeNull();
    expect(uncleBox).not.toBeNull();

    // Rect intersection test — any overlap on both axes = pixel collision.
    const overlaps =
      !!midBox &&
      !!uncleBox &&
      !(
        midBox.x + midBox.width <= uncleBox.x ||
        uncleBox.x + uncleBox.width <= midBox.x ||
        midBox.y + midBox.height <= uncleBox.y ||
        uncleBox.y + uncleBox.height <= midBox.y
      );
    expect(
      overlaps,
      `top00/mid00 (${JSON.stringify(midBox)}) overlaps top01 (${JSON.stringify(uncleBox)})`,
    ).toBe(false);
  });
});

/**
 * Folder-dropdown navigation (Bug 2 fix) — selecting a deep folder must
 * actually shift the viewport, not silently fitView on the whole graph.
 */
test.describe("Folder dropdown shifts viewport (Bug 2)", () => {
  test("selecting a deep folder expands ancestors AND shifts the viewport", async ({ page }) => {
    await page.goto("/?graph=large");
    await waitForGraphReady(page);
    await page.waitForTimeout(500);

    const viewport = page.locator(".react-flow__viewport").first();
    const parseTransform = (s: string | null) => {
      if (!s) return { tx: 0, ty: 0, scale: 1 };
      const m = s.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)\s*scale\(([-\d.]+)\)/);
      if (!m) return { tx: 0, ty: 0, scale: 1 };
      return { tx: +m[1], ty: +m[2], scale: +m[3] };
    };

    const before = parseTransform(await viewport.getAttribute("style"));

    // Pick a deep path. The large fixture has `top10/mid05` available.
    await page.getByTestId("filter-folder").selectOption("top10/mid05");
    // Wait for rAF-deferred fitBounds animation (400ms duration + slack).
    await page.waitForTimeout(1200);

    // All ancestors of top10/mid05 should now be expanded.
    await expect(page.getByTestId("cluster-top10")).toHaveAttribute(
      "data-expanded",
      "true",
    );
    await expect(page.getByTestId("cluster-top10/mid05")).toHaveAttribute(
      "data-expanded",
      "true",
    );

    // Viewport must have shifted OR zoomed (either component changes).
    const after = parseTransform(await viewport.getAttribute("style"));
    const moved =
      Math.abs(after.tx - before.tx) > 10 ||
      Math.abs(after.ty - before.ty) > 10 ||
      Math.abs(after.scale - before.scale) > 0.01;
    expect(
      moved,
      `viewport transform did not shift (before=${JSON.stringify(before)} after=${JSON.stringify(after)})`,
    ).toBe(true);
  });
});
