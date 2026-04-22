/**
 * FPS bench skeleton.
 *
 * I.1 will enable this with the real threshold (p95 frame < 33 ms ≈ 30 FPS)
 * after V.4 lands the cluster-aware GraphCanvas wiring. Until then the spec
 * compiles but is test.skipped so CI isn't red on partial progress.
 *
 * When enabling (I.1):
 *   1. remove `.skip` below
 *   2. point the page at the large-scale fixture (global-setup.ts stages it
 *      at viewer/e2e/fixtures/large/graph.json and copies into dist/)
 *   3. captureFrameTimes pans the canvas via mouse.wheel for 2s
 *   4. assert p95 frame time < 33ms
 *   5. FAIL ⇒ STOP, route to /diagnose (Risk #1: re-plan to Cytoscape,
 *      NOT inline optimization)
 */
import { test, expect } from "@playwright/test";

test.describe("FPS bench — large-scale fixture", () => {
  // TODO: enable after V.4
  test.skip("p95 frame time < 33 ms on 3k-file fixture pan", async ({ page }) => {
    // Stage the large fixture as the served graph.json. The bench loads from
    // /graph-large.json which global-setup.ts copies into dist/ alongside the
    // regular graph.json.
    await page.goto("/?graph=large");

    // Wait for the cluster canvas to settle.
    await page.waitForSelector("[data-testid='graph-canvas']");
    await expect(page.getByTestId("graph-canvas")).toBeVisible();

    // Collapse all to force virtualized (omitted-from-nodes[]) state.
    // Default state on load is already top-level-collapsed per V.4.

    const frames = await captureFrameTimes(page, 2000);
    const p95 = percentile(frames, 0.95);
    // Store the measurement as a test annotation for future baseline.
    test.info().annotations.push({
      type: "fps-bench",
      description: `p95 frame time = ${p95.toFixed(2)} ms over ${frames.length} frames`,
    });
    expect(p95, `p95 frame time must be < 33ms`).toBeLessThan(33);
  });
});

async function captureFrameTimes(
  page: import("@playwright/test").Page,
  durationMs: number,
): Promise<number[]> {
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
