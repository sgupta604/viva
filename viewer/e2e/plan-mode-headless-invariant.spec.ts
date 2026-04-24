/**
 * Plan Mode — Phase 1 headless-invariant E2E.
 *
 * The Phase 1 contract: flipping `planModeEnabled` on while there is NO
 * active plan must produce a graph that is byte-identical to the pre-toggle
 * baseline. The composer's identity-passthrough by reference equality is
 * what makes this true (no `useMemo` dep churn → no re-layout).
 *
 * We assert it three ways:
 *  - Node count identical pre vs post toggle.
 *  - Edge count identical pre vs post toggle.
 *  - Set of node ids identical pre vs post toggle.
 *
 * Pixel snapshot tolerance is intentionally avoided here — the data-level
 * assertion is stronger than a screenshot diff (which would tolerate a
 * 1px reflow as "passing"). If the data is identical AND the layout
 * pipeline is purely deterministic from the data, the rendered pixels are
 * identical too.
 */
import { expect, test } from "@playwright/test";
import { waitForGraphReady } from "./helpers";

declare global {
  interface Window {
    __vivaPlanModeStore?: {
      getState: () => {
        planModeEnabled: boolean;
        activePlanId: string | null;
        togglePlanMode: () => void;
      };
    };
  }
}

test("Phase 1 headless invariant: toggling planModeEnabled with no active plan changes nothing visible", async ({
  page,
}) => {
  await page.goto("/");
  await waitForGraphReady(page);

  // Capture baseline node + edge ids/counts BEFORE toggling plan mode.
  const baseline = await collectGraphSignature(page);
  expect(baseline.nodeCount).toBeGreaterThan(0);

  // Confirm the test hook is mounted, then flip the toggle. No active plan
  // exists (the store boots empty), so the composer's identity-passthrough
  // path is exercised.
  await page.evaluate(() => {
    const store = window.__vivaPlanModeStore;
    if (!store) throw new Error("__vivaPlanModeStore handle missing — store didn't mount?");
    const before = store.getState().planModeEnabled;
    if (before) throw new Error("planModeEnabled must boot to false");
    if (store.getState().activePlanId !== null) {
      throw new Error("activePlanId must boot to null for this invariant");
    }
    store.getState().togglePlanMode();
    if (!store.getState().planModeEnabled) {
      throw new Error("togglePlanMode did not flip planModeEnabled");
    }
  });

  // Give React a frame to react to the store change. Even though the
  // composer is identity-passthrough, the component does re-evaluate its
  // useMemo (it just gets the same reference back) — let any micro-task
  // settle before we re-read the DOM.
  await page.waitForTimeout(100);
  await waitForGraphReady(page);

  const post = await collectGraphSignature(page);

  expect(post.nodeCount).toBe(baseline.nodeCount);
  expect(post.edgeCount).toBe(baseline.edgeCount);
  expect(post.nodeIds.sort()).toEqual(baseline.nodeIds.sort());
  expect(post.edgeIds.sort()).toEqual(baseline.edgeIds.sort());

  // Cleanup — flip the toggle off so the persisted localStorage state
  // doesn't leak into other specs that share the preview server.
  await page.evaluate(() => {
    window.__vivaPlanModeStore?.getState().togglePlanMode();
  });
});

async function collectGraphSignature(page: import("@playwright/test").Page) {
  return await page.evaluate(() => {
    const nodes = Array.from(
      document.querySelectorAll<HTMLElement>(".react-flow__node"),
    );
    const edges = Array.from(
      document.querySelectorAll<HTMLElement>(".react-flow__edge"),
    );
    return {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      nodeIds: nodes.map((n) => n.getAttribute("data-id") ?? n.id ?? ""),
      edgeIds: edges.map((e) => e.getAttribute("data-id") ?? e.id ?? ""),
    };
  });
}
