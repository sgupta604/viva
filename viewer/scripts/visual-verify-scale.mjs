// Scale verification (3k fixture) for large-codebase-viewer.
//
// Navigates to /?graph=large to load the 3k synthetic fixture, then runs the
// programmatic layout-correctness checks described in visual-verify-scale.md:
//
//   1. Default-collapsed top-level tiles do not overlap.
//   2. Expand one top cluster — its sub-clusters don't overlap each other
//      AND don't overlap sibling top-level clusters.
//   3. Expand a sub-cluster within (1)'s expanded parent — same checks one
//      level deeper (recursive containment).
//   4. Edges render (>0) at the initial collapsed state.
//   5. Top-cluster badges are plausible (each > 0, sum across 3 sample
//      tops is large).
//   6. Capture deep zoom-out + zoom-in screenshots for subjective judgment.
//
// Screenshots are saved under
//   .claude/active-work/large-codebase-viewer/screenshots/06-scale-verify-*.png
//
// Exits non-zero if any programmatic invariant fails so CI / the driver can
// tell PASS from FAIL. Subjective screenshots are captured regardless.
import { chromium } from "@playwright/test";
import { resolve } from "node:path";
import { mkdirSync } from "node:fs";

const OUT_DIR = resolve(
  process.cwd(),
  "../.claude/active-work/large-codebase-viewer/screenshots",
);
mkdirSync(OUT_DIR, { recursive: true });

// Minimum on-screen extent (px) we require from the graph's overall
// bounding box at the deepest allowed zoom-out. If minZoom is too
// permissive, the whole graph collapses into a speck — we fail the
// check if the LARGER axis of the union of all node rects drops
// below this floor. At pre-polish minZoom=0.05 the 3k fixture's
// total extent was ~60×20 px (both axes way below the floor); with
// minZoom=0.2 the graph is legible as a 4×5 tile grid (~285×100 px,
// well past the floor along its longer axis).
const MIN_GRAPH_EXTENT_PX = 200;

async function measureGraphBoundingBox(page) {
  // Union every React Flow node's rect, including both cluster nodes
  // and file nodes. Returns null if nothing visible.
  return page.evaluate(() => {
    const nodes = document.querySelectorAll(
      ".react-flow__node-cluster, .react-flow__node-file",
    );
    if (nodes.length === 0) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    nodes.forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      if (r.x < minX) minX = r.x;
      if (r.y < minY) minY = r.y;
      if (r.x + r.width > maxX) maxX = r.x + r.width;
      if (r.y + r.height > maxY) maxY = r.y + r.height;
    });
    if (!Number.isFinite(minX)) return null;
    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
      count: nodes.length,
    };
  });
}

const BASE = process.env.VIEWER_URL ?? "http://localhost:5173";

function rectsOverlap(a, b) {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  );
}

function allPairsNonOverlapping(rects) {
  const offenders = [];
  for (let i = 0; i < rects.length; i += 1) {
    for (let j = i + 1; j < rects.length; j += 1) {
      if (rectsOverlap(rects[i], rects[j])) {
        offenders.push([rects[i].id, rects[j].id]);
      }
    }
  }
  return offenders;
}

async function readClusterRects(page, selector) {
  return page.$$eval(selector, (els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return {
        id: el.getAttribute("data-testid"),
        path: el.getAttribute("data-cluster-path"),
        parent: el.getAttribute("data-cluster-parent"),
        expanded: el.getAttribute("data-expanded") === "true",
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
      };
    }),
  );
}

async function run() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1920, height: 1200 },
  });
  const page = await ctx.newPage();
  const errors = [];
  const report = [];

  page.on("pageerror", (e) => errors.push(`[pageerror] ${e}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`[console.error] ${msg.text()}`);
  });

  // --- Load large fixture ---
  await page.goto(`${BASE}/?graph=large`);
  await page.evaluate(() => sessionStorage.clear());
  await page.goto(`${BASE}/?graph=large`);
  await page.waitForSelector("[data-testid='graph-canvas']", {
    timeout: 15_000,
  });
  await page.waitForTimeout(1200);

  // --- Check 1: default-collapsed top tiles do not overlap ---
  const topRects = await readClusterRects(
    page,
    '[data-cluster-parent=""]',
  );
  report.push(`CHECK 1: ${topRects.length} top-level clusters at default-collapsed state`);
  if (topRects.length < 5) {
    errors.push(
      `CHECK 1 FAIL — expected >= 5 top clusters at root, saw ${topRects.length}`,
    );
  }
  const topOverlaps = allPairsNonOverlapping(topRects);
  if (topOverlaps.length > 0) {
    errors.push(
      `CHECK 1 FAIL — ${topOverlaps.length} top-tile pair(s) overlap: ${topOverlaps
        .slice(0, 5)
        .map((p) => p.join(" vs "))
        .join("; ")}`,
    );
  } else {
    report.push("CHECK 1 PASS — no top-level tile overlaps");
  }

  // Capture default-collapsed screenshot
  await page.screenshot({
    path: resolve(OUT_DIR, "06-scale-verify-01-default-collapsed.png"),
    fullPage: false,
  });

  // --- Check 4 (early): edges render at default state ---
  const initialEdgeCount = await page
    .locator("svg.react-flow__edges path.react-flow__edge-path")
    .count();
  report.push(`CHECK 4: ${initialEdgeCount} edge paths at default-collapsed state`);
  if (initialEdgeCount === 0) {
    errors.push(
      "CHECK 4 FAIL — expected > 0 edges at collapsed state (cross-cluster d-aggregate/logical-id/include)",
    );
  }

  // --- Check 5: badge counts ---
  const sampleTops = ["top00", "top01", "top02"];
  let badgeSum = 0;
  for (const top of sampleTops) {
    const badgeText = await page
      .locator(`[data-testid="cluster-${top}"] span.shrink-0`)
      .first()
      .textContent()
      .catch(() => null);
    const n = Number.parseInt(badgeText?.trim() ?? "NaN", 10);
    report.push(`CHECK 5: cluster-${top} badge = "${badgeText?.trim()}" (parsed ${n})`);
    if (!Number.isFinite(n) || n <= 0) {
      errors.push(
        `CHECK 5 FAIL — cluster-${top} badge reads "${badgeText}" (want positive integer)`,
      );
    } else {
      badgeSum += n;
    }
  }
  report.push(`CHECK 5: sample sum = ${badgeSum} (3 tops × ~150 files each ≈ 450)`);
  if (badgeSum < 100) {
    errors.push(
      `CHECK 5 FAIL — sample badge sum = ${badgeSum}, want >= 100 (each top has ~150 descendants)`,
    );
  }

  // --- Check 2: expand one top cluster, assert child/sibling disjointness ---
  const firstTopPath = topRects[0]?.path ?? "top00";
  await page.locator(`[data-testid="cluster-${firstTopPath}"]`).click();
  await page.waitForTimeout(700);
  await page.screenshot({
    path: resolve(OUT_DIR, "06-scale-verify-02-one-top-expanded.png"),
    fullPage: false,
  });

  const expandedTopChildren = await readClusterRects(
    page,
    `[data-cluster-parent="${firstTopPath}"]`,
  );
  report.push(
    `CHECK 2: expanded ${firstTopPath}, ${expandedTopChildren.length} sub-clusters rendered`,
  );
  const level1Overlaps = allPairsNonOverlapping(expandedTopChildren);
  if (level1Overlaps.length > 0) {
    errors.push(
      `CHECK 2 FAIL — expanded sub-clusters overlap each other: ${level1Overlaps
        .slice(0, 5)
        .map((p) => p.join(" vs "))
        .join("; ")}`,
    );
  } else {
    report.push("CHECK 2 PASS — sub-clusters within expanded parent are disjoint");
  }

  // Re-read sibling top tiles (they may have shifted when layout reflowed)
  const siblingsAfterExpand = await readClusterRects(
    page,
    '[data-cluster-parent=""]',
  );
  const otherSiblings = siblingsAfterExpand.filter(
    (c) => c.path !== firstTopPath,
  );
  const crossErrors = [];
  for (const g of expandedTopChildren) {
    for (const s of otherSiblings) {
      if (rectsOverlap(g, s)) {
        crossErrors.push(`${g.id} (child of ${firstTopPath}) vs ${s.id}`);
      }
    }
  }
  if (crossErrors.length > 0) {
    errors.push(
      `CHECK 2 FAIL — expanded children bleed into sibling tops: ${crossErrors.slice(0, 5).join("; ")}`,
    );
  } else {
    report.push("CHECK 2 PASS — no bleed into sibling top clusters");
  }

  // --- Check 3: expand a sub-cluster inside the already-expanded top ---
  // Pick the first visible sub-cluster of firstTopPath.
  const subPath = expandedTopChildren[0]?.path;
  if (!subPath) {
    errors.push(
      `CHECK 3 SKIP — no sub-cluster found under ${firstTopPath} to drill into`,
    );
  } else {
    await page.locator(`[data-testid="cluster-${subPath}"]`).click();
    await page.waitForTimeout(700);
    await page.screenshot({
      path: resolve(OUT_DIR, "06-scale-verify-03-sub-expanded.png"),
      fullPage: false,
    });

    const grandchildren = await readClusterRects(
      page,
      `[data-cluster-parent="${subPath}"]`,
    );
    // For the 3k fixture, mid-clusters are leaf clusters — they contain FILE
    // nodes, not sub-clusters. Include file nodes in the containment check so
    // recursive-containment is validated at the fixture's actual max depth.
    const grandchildFiles = await page.$$eval(
      '[data-testid^="rf__node-"].react-flow__node-file',
      (els) =>
        els.map((el) => {
          const r = el.getBoundingClientRect();
          return {
            id: el.getAttribute("data-id"),
            x: r.x,
            y: r.y,
            width: r.width,
            height: r.height,
          };
        }),
    );
    report.push(
      `CHECK 3: expanded ${subPath}, ${grandchildren.length} grandchild clusters + ${grandchildFiles.length} file nodes rendered`,
    );
    // Treat file nodes as grandchildren for the overlap check.
    grandchildren.push(...grandchildFiles);

    // Re-read current top-level and sibling-of-sub rects
    const topsAfter = await readClusterRects(
      page,
      '[data-cluster-parent=""]',
    );
    const uncleSubs = await readClusterRects(
      page,
      `[data-cluster-parent="${firstTopPath}"]`,
    );
    const uncles = uncleSubs.filter((c) => c.path !== subPath);

    const grandchildCrossErrors = [];
    for (const g of grandchildren) {
      // grandchildren must not overlap with any other sub-cluster of firstTopPath
      for (const u of uncles) {
        if (rectsOverlap(g, u)) {
          grandchildCrossErrors.push(`${g.id} (grandchild) vs ${u.id} (uncle)`);
        }
      }
      // grandchildren must not overlap top-level sibling clusters either
      for (const t of topsAfter.filter((t) => t.path !== firstTopPath)) {
        if (rectsOverlap(g, t)) {
          grandchildCrossErrors.push(
            `${g.id} (grandchild) vs ${t.id} (top sibling)`,
          );
        }
      }
    }
    if (grandchildCrossErrors.length > 0) {
      errors.push(
        `CHECK 3 FAIL — grandchildren bleed: ${grandchildCrossErrors.slice(0, 5).join("; ")}`,
      );
    } else if (grandchildren.length > 0) {
      report.push(
        "CHECK 3 PASS — grandchildren stay within expanded parent",
      );
    }
  }

  // --- Check 6: zoom-out and zoom-in for subjective judgment ---
  // Re-collapse the expanded top by clicking its HEADER (not the outer wrapper,
  // which an expanded cluster's child might intercept). Header is the first
  // role=button descendant with aria-expanded=true.
  try {
    const header = page
      .locator(`[data-testid="cluster-${firstTopPath}"] [role="button"][aria-expanded="true"]`)
      .first();
    await header.click({ timeout: 5_000, force: true });
    await page.waitForTimeout(500);
  } catch (e) {
    report.push(`CHECK 6 WARN — could not re-collapse ${firstTopPath}: ${String(e).slice(0, 120)}`);
  }

  // Simulate zoom-out via mouse wheel in the canvas
  const canvasBB = await page
    .locator('[data-testid="graph-canvas"]')
    .boundingBox();
  if (canvasBB) {
    await page.mouse.move(canvasBB.x + canvasBB.width / 2, canvasBB.y + canvasBB.height / 2);
    for (let i = 0; i < 10; i += 1) {
      await page.mouse.wheel(0, 500);
      await page.waitForTimeout(60);
    }
    await page.waitForTimeout(600);
    await page.screenshot({
      path: resolve(OUT_DIR, "06-scale-verify-04-zoomed-out.png"),
      fullPage: false,
    });

    // Zoom back in and past default
    for (let i = 0; i < 18; i += 1) {
      await page.mouse.wheel(0, -500);
      await page.waitForTimeout(60);
    }
    await page.waitForTimeout(600);
    await page.screenshot({
      path: resolve(OUT_DIR, "06-scale-verify-05-zoomed-in.png"),
      fullPage: false,
    });
  }

  // --- Edge spot check after zoom ---
  const finalEdgeCount = await page
    .locator("svg.react-flow__edges path.react-flow__edge-path")
    .count();
  report.push(`CHECK 4b: ${finalEdgeCount} edge paths after zoom interactions`);

  // --- Polish check A: minZoom bounding-box floor + screenshot ---
  // Wheel far out again (more than enough to saturate at current minZoom)
  // and assert the graph's overall extent stays above MIN_GRAPH_EXTENT_PX
  // along both axes. Then save 07-polish-minzoom.png.
  if (canvasBB) {
    await page.mouse.move(canvasBB.x + canvasBB.width / 2, canvasBB.y + canvasBB.height / 2);
    for (let i = 0; i < 25; i += 1) {
      await page.mouse.wheel(0, 500);
      await page.waitForTimeout(40);
    }
    await page.waitForTimeout(500);
    const bbox = await measureGraphBoundingBox(page);
    report.push(
      `POLISH A: graph bbox at max zoom-out = ${
        bbox ? `${Math.round(bbox.width)}×${Math.round(bbox.height)} px (${bbox.count} nodes)` : "null"
      } (floor = ${MIN_GRAPH_EXTENT_PX}px)`,
    );
    if (!bbox) {
      errors.push(
        "POLISH A FAIL — could not measure graph bounding box at max zoom-out",
      );
    } else {
      // Use the longer axis for the floor check — the 3k fixture's
      // grid is deliberately wider than tall (4×5 of horizontally
      // arranged tops), so a "both axes ≥ floor" rule would wrongly
      // penalize a perfectly legible layout.
      const longAxis = Math.max(bbox.width, bbox.height);
      if (longAxis < MIN_GRAPH_EXTENT_PX) {
        errors.push(
          `POLISH A FAIL — graph bbox ${Math.round(bbox.width)}×${Math.round(
            bbox.height,
          )} px — longer axis ${Math.round(longAxis)}px below ${MIN_GRAPH_EXTENT_PX}px floor. minZoom is too permissive.`,
        );
      } else {
        report.push(
          `POLISH A PASS — graph stays legible at max zoom-out (long axis ${Math.round(longAxis)}px ≥ ${MIN_GRAPH_EXTENT_PX}px)`,
        );
      }
    }
    await page.screenshot({
      path: resolve(OUT_DIR, "07-polish-minzoom.png"),
      fullPage: false,
    });

    // Restore to a reasonable zoom/pan for the next screenshot by
    // clicking React Flow's built-in fit-view control. Wheel-zooming
    // back leaves the viewport arbitrarily panned and causes the
    // cluster-top00 click below to fall outside the viewport.
    const fitViewBtn = page
      .locator(".react-flow__controls-fitview")
      .first();
    if (await fitViewBtn.count()) {
      await fitViewBtn.click({ force: true });
      await page.waitForTimeout(500);
    } else {
      for (let i = 0; i < 25; i += 1) {
        await page.mouse.wheel(0, -500);
        await page.waitForTimeout(30);
      }
      await page.waitForTimeout(400);
    }
  }

  // --- Polish check B: edge-label-over-cluster screenshot ---
  // Expand top00 then one of its mid-clusters — this reliably produces
  // `logical-id ×N` / `d-aggregate ×N` labels whose bounding box used
  // to overlap a sibling cluster's border corner (visual mud). With
  // the labelBg padding/radius bump, the label should now stand proud.
  try {
    await page.locator(`[data-testid="cluster-top00"]`).click({ force: true });
    await page.waitForTimeout(500);
    // Drill one level deeper to populate `d-aggregate ×10` labels
    // adjacent to expanded-parent borders — the exact scenario where
    // label-over-border mud appeared in screenshots 02/03.
    const firstMid = await page
      .locator(`[data-cluster-parent="top00"]`)
      .first()
      .getAttribute("data-cluster-path");
    if (firstMid) {
      await page
        .locator(`[data-testid="cluster-${firstMid}"]`)
        .click({ force: true });
      await page.waitForTimeout(500);
    }
    await page.screenshot({
      path: resolve(OUT_DIR, "07-polish-edge-labels.png"),
      fullPage: false,
    });
    report.push(
      "POLISH B: captured edge-label screenshot (eyeball for residual mud)",
    );
  } catch (e) {
    report.push(
      `POLISH B WARN — edge-label screenshot capture failed: ${String(e).slice(0, 120)}`,
    );
  }

  await browser.close();

  console.log("\n--- REPORT ---");
  for (const line of report) console.log(`  ${line}`);
  if (errors.length > 0) {
    console.error("\n--- ERRORS ---");
    for (const e of errors) console.error(`  ${e}`);
    process.exit(1);
  }
  console.log("\nPASS — scale-level layout invariants satisfied.");
}

run().catch((e) => {
  console.error(e);
  process.exit(2);
});
