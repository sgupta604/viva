// Self-verify script for blocker-fix pass: drives a headless Chromium at the
// production build (served by `python -m http.server`) and captures the 3 key
// states identified in visual-verify.md: default collapsed, crawler expanded,
// and drill-deep (crawler → tests → fixtures → sample-module). Saves PNGs to
// .claude/active-work/large-codebase-viewer/screenshots/05-post-blocker-fix-*.png
//
// Exits non-zero if:
//   - `crawler` badge reads "0" at default collapsed state, OR
//   - a grandchild cluster's bounding box intersects a sibling cluster's rect.
import { chromium } from "@playwright/test";
import { resolve } from "node:path";

const OUT_DIR = resolve(
  process.cwd(),
  "../.claude/active-work/large-codebase-viewer/screenshots",
);
const BASE = process.env.VIEWER_URL ?? "http://localhost:5173";

function rectsOverlap(a, b) {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  );
}

async function run() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1200 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`[console.error] ${msg.text()}`);
  });

  // Clear sessionStorage so the default-expanded top cluster heuristic still
  // applies but no stale expansion carries over from earlier runs.
  await page.goto(BASE);
  await page.evaluate(() => sessionStorage.clear());
  await page.goto(BASE);
  await page.waitForSelector("[data-testid='graph-canvas']", { timeout: 10_000 });
  await page.waitForTimeout(700);

  // --- Step 1: default collapsed ---
  await page.screenshot({
    path: resolve(OUT_DIR, "05-post-blocker-fix-01-default.png"),
    fullPage: false,
  });

  // Read the badge text on the `crawler` cluster (direct children sample-d-dir
  // etc. live beneath it; its own childFiles list is empty in this crawl).
  const crawlerBadge = await page
    .locator('[data-testid="cluster-crawler"] span.shrink-0')
    .first()
    .textContent();
  console.log(`[check] crawler badge = "${crawlerBadge?.trim()}"`);
  const crawlerNum = Number.parseInt(crawlerBadge?.trim() ?? "NaN", 10);
  if (!Number.isFinite(crawlerNum) || crawlerNum <= 0) {
    errors.push(
      `BLOCKER 2 regression — crawler badge reads "${crawlerBadge}" (want a positive integer)`,
    );
  }

  const viewerBadge = await page
    .locator('[data-testid="cluster-viewer"] span.shrink-0')
    .first()
    .textContent();
  console.log(`[check] viewer badge = "${viewerBadge?.trim()}"`);

  // --- Step 2: expand crawler ---
  await page.locator('[data-testid="cluster-crawler"]').click();
  await page.waitForTimeout(500);
  await page.screenshot({
    path: resolve(OUT_DIR, "05-post-blocker-fix-02-crawler-expanded.png"),
    fullPage: false,
  });

  // Verify no sibling-overlap at level 1: every direct child of crawler should
  // be non-overlapping with viva's other top cluster (viewer).
  const level1 = await page.$$eval(
    '[data-cluster-parent="crawler"]',
    (els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return {
          id: el.getAttribute("data-testid"),
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height,
        };
      }),
  );
  const viewerRect = await page
    .locator('[data-testid="cluster-viewer"]')
    .first()
    .boundingBox();
  if (viewerRect && level1.length > 0) {
    for (const child of level1) {
      if (rectsOverlap(child, viewerRect)) {
        errors.push(
          `overlap at L1 — ${child.id} intersects cluster-viewer`,
        );
      }
    }
  }

  // --- Step 3: drill deeper — expand crawler/tests, then crawler/tests/fixtures,
  // then crawler/tests/fixtures/sample-module (the exact failure mode in
  // 04-post-fix-03-drill-deeper.png) ---
  const drill = [
    "crawler/tests",
    "crawler/tests/fixtures",
    "crawler/tests/fixtures/sample-module",
  ];
  for (const path of drill) {
    const loc = page.locator(`[data-testid="cluster-${path}"]`).first();
    if ((await loc.count()) === 0) {
      console.log(`[skip] cluster-${path} not found — crawl may differ`);
      break;
    }
    await loc.click();
    await page.waitForTimeout(350);
  }
  await page.screenshot({
    path: resolve(OUT_DIR, "05-post-blocker-fix-03-drill-deeper.png"),
    fullPage: false,
  });

  // BLOCKER 1 check: grandchildren of `sample-module` (config, pipelines, etc.)
  // must not overlap its SIBLING clusters (sample-d-dir, sample-fallback,
  // sample-logical-id — direct children of `crawler/tests/fixtures`).
  const smChildren = await page.$$eval(
    '[data-cluster-parent="crawler/tests/fixtures/sample-module"]',
    (els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return {
          id: el.getAttribute("data-testid"),
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height,
        };
      }),
  );
  const smSiblings = await page.$$eval(
    '[data-cluster-parent="crawler/tests/fixtures"]',
    (els) =>
      els
        .filter(
          (el) =>
            el.getAttribute("data-cluster-path") !==
            "crawler/tests/fixtures/sample-module",
        )
        .map((el) => {
          const r = el.getBoundingClientRect();
          return {
            id: el.getAttribute("data-testid"),
            x: r.x,
            y: r.y,
            width: r.width,
            height: r.height,
          };
        }),
  );
  console.log(
    `[check] sample-module children = ${smChildren.length}, siblings = ${smSiblings.length}`,
  );
  for (const g of smChildren) {
    for (const s of smSiblings) {
      if (rectsOverlap(g, s)) {
        errors.push(
          `BLOCKER 1 regression — ${g.id} (grandchild) overlaps ${s.id} (uncle)`,
        );
      }
    }
  }

  // Also check: no grandchild overlaps `viewer` at the top level either.
  if (viewerRect) {
    for (const g of smChildren) {
      if (rectsOverlap(g, viewerRect)) {
        errors.push(
          `BLOCKER 1 regression — grandchild ${g.id} overlaps top-level viewer`,
        );
      }
    }
  }

  await browser.close();

  if (errors.length > 0) {
    console.error("\nFAIL — blocker fixes incomplete:");
    for (const e of errors) console.error("  - " + e);
    process.exit(1);
  }
  console.log("\nPASS — blockers resolved in built app.");
}

run().catch((e) => {
  console.error(e);
  process.exit(2);
});
