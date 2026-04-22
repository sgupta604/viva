/**
 * elkjs layout worker skeleton.
 *
 * Intended usage (v2+): spawn with `new Worker(new URL("./layout.worker.ts",
 * import.meta.url), { type: "module" })`. The worker receives ELK input JSON
 * via postMessage and returns the positioned result.
 *
 * Status: **skeleton / opt-in.** The default layout path is the synchronous
 * grid-pack in `cluster-layout.ts`, which is sufficient for the 3k-file
 * fixture's FPS gate. elk-based refinement is preserved here for future
 * opt-in via `computeElkLayout()` — NOT called from the critical render path
 * in this feature; exercising it is a V2.1 follow-up once the sync layout's
 * aesthetics become the limiting factor.
 *
 * Why skeleton: elkjs's worker build under Vite required a deeper rewrite
 * (WebWorker type="module" + bundled.js relpath) than the FPS gate demanded.
 * Keeping the import wired here means the dep is in the bundle graph and
 * `npm run build` validates resolution — when the follow-up lands, only the
 * `onmessage` dispatch + main-thread caller need to change.
 */
import ELK from "elkjs/lib/elk.bundled.js";

export interface ElkNode {
  id: string;
  width?: number;
  height?: number;
  children?: ElkNode[];
  edges?: Array<{ id: string; sources: string[]; targets: string[] }>;
  layoutOptions?: Record<string, string>;
}

/**
 * Run elk.layered with `hierarchyHandling: INCLUDE_CHILDREN` on an ELK graph.
 * Opt-in entry point; not used in the main render path yet.
 */
export async function computeElkLayout(root: ElkNode): Promise<ElkNode> {
  const elk = new ELK();
  return (await elk.layout(root, {
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.hierarchyHandling": "INCLUDE_CHILDREN",
      "elk.direction": "RIGHT",
      "elk.layered.spacing.nodeNodeBetweenLayers": "60",
      "elk.spacing.nodeNode": "40",
    },
  })) as ElkNode;
}
