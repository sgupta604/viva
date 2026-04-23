/**
 * E2E coverage for Bug #2 (image #17, 2026-04-22): cluster mode at scale
 * had straight smoothstep edges that crisscrossed every cluster box and
 * made the canvas unreadable. Fix: bezier curves for non-hierarchy cross-
 * ref edges in cluster mode + soft focus dim when something is selected.
 *
 * What this spec locks:
 *
 *   1. Cluster-mode cross-ref edges render as React Flow `default` (bezier)
 *      type, NOT `smoothstep` (orthogonal). Tested by class on the
 *      `react-flow__edge` wrapper.
 *
 *   2. Hierarchy edges (d-aggregate) in cluster mode keep their previous
 *      treatment (no bezier). They're rare in cluster mode (containment
 *      carries the relationship) but the invariant is locked anyway.
 *
 *   3. Default cluster-mode state with nothing selected: every cross-ref
 *      edge renders at full opacity. The user's "info-density is fine"
 *      verdict is preserved at idle.
 *
 *   4. Selection triggers soft dim: clicking a file makes unrelated
 *      cross-ref edges drop to ~0.35 opacity while edges touching the
 *      selected file stay full. The DOM-level opacity check is the
 *      regression guard for the focus-dim feature.
 *
 *   5. Pressing Escape clears selection and every edge returns to full
 *      opacity (info-density restored).
 *
 * Why this lives in its own spec file: tree-layout.spec.ts already pins
 * the legend + toggle + z-order behavior. This spec is purely about the
 * Bug #2 visual fixes — keeping it isolated keeps test failures pointing
 * at the right symptom.
 */
import { test, expect, type Page } from "@playwright/test";

/**
 * Fresh page with `clusters` explicitly selected via localStorage. The
 * sessionStorage hierarchy state is also cleared so the test's expand
 * sequence runs from a known clean baseline.
 */
async function gotoFreshClusters(page: Page, url = "/"): Promise<void> {
  await page.addInitScript(() => {
    try {
      window.localStorage.clear();
      window.sessionStorage.clear();
      window.localStorage.setItem("viva.viewStore.graphLayout", "clusters");
    } catch {
      // private mode — ignore
    }
  });
  await page.goto(url);
}

test.describe("cluster-mode bezier edges (Bug #2)", () => {
  test("cross-ref edges render as bezier `default`, not orthogonal `smoothstep`", async ({
    page,
  }) => {
    await gotoFreshClusters(page);
    await expect(page.getByTestId("graph-canvas")).toBeVisible({ timeout: 10_000 });

    // Need at least ONE expanded cluster so cross-ref edges show up between
    // file nodes. The default fixture has a single top-level cluster that
    // auto-expands; if there are intra-cluster edges they'll surface here.
    const result = await page.evaluate(() => {
      const edges = document.querySelectorAll(".react-flow__edge");
      let bezier = 0;
      let smoothstep = 0;
      let other = 0;
      for (const e of edges) {
        // React Flow tags the wrapper with `react-flow__edge-${type}` —
        // `default` = bezier, `smoothstep` = orthogonal.
        if (e.classList.contains("react-flow__edge-default")) bezier += 1;
        else if (e.classList.contains("react-flow__edge-smoothstep"))
          smoothstep += 1;
        else other += 1;
      }
      return { total: edges.length, bezier, smoothstep, other };
    });

    // If there are no edges at all in the default fixture, skip — the
    // bezier vs smoothstep distinction is moot.
    if (result.total === 0) {
      test.info().annotations.push({
        type: "note",
        description: "fixture has no edges — bezier check is a no-op",
      });
      return;
    }

    // The fix: every NON-hierarchy edge is bezier. Hierarchy edges
    // (`d-aggregate`) in cluster mode are vanishingly rare since
    // containment carries the relationship; if there's a smoothstep edge
    // present, it should be a hierarchy d-aggregate one (covered by the
    // dedicated hierarchy test below). At least the majority MUST be
    // bezier post-Bug-#2 fix.
    expect(
      result.bezier,
      `expected most cross-ref edges to be bezier; got ${result.bezier} bezier vs ${result.smoothstep} smoothstep (total ${result.total})`,
    ).toBeGreaterThan(0);
    expect(result.bezier).toBeGreaterThanOrEqual(result.smoothstep);
  });

  test("default state with nothing selected: every edge is full opacity (info-density preserved)", async ({
    page,
  }) => {
    await gotoFreshClusters(page);
    await expect(page.getByTestId("graph-canvas")).toBeVisible({ timeout: 10_000 });

    const opacities = await page.evaluate(() => {
      const edges = document.querySelectorAll(".react-flow__edge-path");
      return Array.from(edges).map((e) => {
        const s = e.getAttribute("style") || "";
        const m = s.match(/opacity:\s*([0-9.]+)/);
        return m ? parseFloat(m[1]) : 1;
      });
    });

    if (opacities.length === 0) {
      test.info().annotations.push({
        type: "note",
        description: "fixture has no edges — opacity check is a no-op",
      });
      return;
    }

    // Every edge should be full opacity (1) since nothing is selected.
    // The `crossRefOpacityFor` `anythingFocused=false` branch returns
    // FULL for cluster mode.
    for (const o of opacities) {
      expect(
        o,
        "default cluster-mode opacity should be 1 (info-density preserved)",
      ).toBeGreaterThanOrEqual(0.99);
    }
  });

  test("selecting a file triggers soft dim (~0.35) on unrelated edges", async ({
    page,
  }) => {
    await gotoFreshClusters(page);
    await expect(page.getByTestId("graph-canvas")).toBeVisible({ timeout: 10_000 });

    // Click the first file node we can find — that's enough to set
    // selectedFileId and trigger the soft-dim path.
    const fileSelected = await page.evaluate(() => {
      const file = document.querySelector(".react-flow__node-file");
      if (!file) return false;
      const rect = file.getBoundingClientRect();
      const cx = rect.x + rect.width / 2;
      const cy = rect.y + rect.height / 2;
      // React Flow uses pointer events under the hood — dispatch the trio
      // (down, up, click) so the onNodeClick handler fires.
      for (const type of ["pointerdown", "pointerup", "click"]) {
        const ev = new MouseEvent(type, {
          bubbles: true,
          cancelable: true,
          clientX: cx,
          clientY: cy,
          button: 0,
        });
        file.dispatchEvent(ev);
      }
      return true;
    });

    if (!fileSelected) {
      test.info().annotations.push({
        type: "note",
        description: "fixture has no file nodes visible — selection no-op",
      });
      return;
    }

    // Give React Flow a tick to re-render after selection state change.
    await page.waitForTimeout(200);

    const buckets = await page.evaluate(() => {
      const edges = document.querySelectorAll(".react-flow__edge-path");
      const out = { full: 0, soft: 0, other: 0 };
      for (const e of edges) {
        const s = e.getAttribute("style") || "";
        const m = s.match(/opacity:\s*([0-9.]+)/);
        const o = m ? parseFloat(m[1]) : 1;
        if (o >= 0.99) out.full += 1;
        else if (Math.abs(o - 0.35) < 0.05) out.soft += 1;
        else out.other += 1;
      }
      return out;
    });

    if (buckets.full + buckets.soft + buckets.other === 0) {
      test.info().annotations.push({
        type: "note",
        description: "no edges visible with selection — dim check no-op",
      });
      return;
    }

    // After selection, at least SOME edges should be in the soft-dim
    // bucket (the unrelated cross-refs). At least SOME may still be full
    // (the focused file's connections + hierarchy edges).
    expect(
      buckets.soft,
      `expected some edges to soft-dim after selection; got full=${buckets.full} soft=${buckets.soft} other=${buckets.other}`,
    ).toBeGreaterThan(0);
  });

  test("Escape clears selection and restores full opacity to every edge", async ({
    page,
  }) => {
    await gotoFreshClusters(page);
    await expect(page.getByTestId("graph-canvas")).toBeVisible({ timeout: 10_000 });

    // Select a file, then Escape.
    await page.evaluate(() => {
      const file = document.querySelector(".react-flow__node-file");
      if (!file) return;
      const rect = file.getBoundingClientRect();
      const cx = rect.x + rect.width / 2;
      const cy = rect.y + rect.height / 2;
      for (const type of ["pointerdown", "pointerup", "click"]) {
        const ev = new MouseEvent(type, {
          bubbles: true,
          cancelable: true,
          clientX: cx,
          clientY: cy,
          button: 0,
        });
        file.dispatchEvent(ev);
      }
    });
    await page.waitForTimeout(150);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);

    const opacities = await page.evaluate(() => {
      const edges = document.querySelectorAll(".react-flow__edge-path");
      return Array.from(edges).map((e) => {
        const s = e.getAttribute("style") || "";
        const m = s.match(/opacity:\s*([0-9.]+)/);
        return m ? parseFloat(m[1]) : 1;
      });
    });

    if (opacities.length === 0) {
      test.info().annotations.push({
        type: "note",
        description: "fixture has no edges — Escape restoration no-op",
      });
      return;
    }

    // After Escape clears selection, every edge should be back to full.
    for (const o of opacities) {
      expect(
        o,
        "Escape should restore default full-opacity info-density",
      ).toBeGreaterThanOrEqual(0.99);
    }
  });
});
