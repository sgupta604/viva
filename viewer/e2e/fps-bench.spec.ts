/**
 * FPS bench — large-scale fixture, both layout modes.
 *
 * Original gate: p95 frame time < 33 ms (~30 FPS) during a 2-second pan
 * loop. v3 (tree-layout-redesign) extends to verify BOTH cluster mode and
 * tree mode meet the gate. The Web Worker + LRU cache in
 * `lib/graph/layout.worker.ts` is what keeps tree mode's pan/zoom from
 * re-running ELK every frame; if this spec ever fails on tree mode, the
 * cache key in `tree-layout.ts:cacheKeyFor` is the first place to look.
 *
 * Failure ⇒ STOP. Route to /diagnose. NOT inline optimization. (Risk #1
 * from research.)
 */
import { test, expect, type Page } from "@playwright/test";

test.describe("FPS bench — large-scale fixture", () => {
  test("clusters mode: p95 frame time < 33 ms on 3k-file fixture pan", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem("viva.viewStore.graphLayout", "clusters");
      } catch {
        /* ignore */
      }
    });
    await page.goto("/?graph=large");
    await page.waitForSelector("[data-testid='graph-canvas']");
    await expect(page.getByTestId("graph-canvas")).toBeVisible();

    const frames = await captureFrameTimes(page, 2000);
    const p95 = percentile(frames, 0.95);
    test.info().annotations.push({
      type: "fps-bench-clusters",
      description: `p95 frame time = ${p95.toFixed(2)} ms over ${frames.length} frames`,
    });
    expect(
      p95,
      `clusters mode p95 frame time must be < 33ms`,
    ).toBeLessThan(33);
  });

  test("tree mode: p95 frame time < 33 ms on 3k-file fixture pan", async ({
    page,
  }) => {
    // Default-on-load is tree, but we set explicitly so a stale localStorage
    // can't flip the mode out from under us.
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem("viva.viewStore.graphLayout", "tree");
      } catch {
        /* ignore */
      }
    });
    await page.goto("/?graph=large");
    await page.waitForSelector("[data-testid='graph-canvas']");
    await expect(page.getByTestId("graph-canvas")).toBeVisible();
    await expect(page.getByTestId("graph-layout-tree")).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // Give the async tree layout a moment to settle the worker round-trip.
    // Cache hit on subsequent re-renders means pan/zoom doesn't re-run ELK.
    await page.waitForTimeout(500);

    const frames = await captureFrameTimes(page, 2000);
    const p95 = percentile(frames, 0.95);
    test.info().annotations.push({
      type: "fps-bench-tree",
      description: `p95 frame time = ${p95.toFixed(2)} ms over ${frames.length} frames`,
    });
    expect(
      p95,
      `tree mode p95 frame time must be < 33ms (LRU cache in layout.worker.ts is the lever)`,
    ).toBeLessThan(33);
  });
});

async function captureFrameTimes(page: Page, durationMs: number): Promise<number[]> {
  return page.evaluate(
    (d) =>
      new Promise<number[]>((resolve) => {
        const times: number[] = [];
        let last = performance.now();
        const stopAt = last + d;
        function frame() {
          const now = performance.now();
          times.push(now - last);
          last = now;
          if (now < stopAt) {
            // Nudge the canvas by scrolling so React Flow repaints.
            window.dispatchEvent(new WheelEvent("wheel", { deltaX: 10 }));
            requestAnimationFrame(frame);
          } else {
            resolve(times);
          }
        }
        requestAnimationFrame(frame);
      }),
    durationMs,
  );
}

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[idx];
}
