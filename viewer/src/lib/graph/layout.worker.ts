/**
 * elkjs layout worker — promoted to PRIMARY for tree mode in v3
 * (tree-layout-redesign).
 *
 * Two entry points:
 *   - `computeElkLayout(root, options)` — pure async function, callable
 *     directly on the main thread (used by Vitest + the SSR-safe fallback
 *     path in `tree-layout.ts` when `Worker` is unavailable).
 *   - `self.onmessage` — when this module is loaded as a Web Worker
 *     (`new Worker(new URL("./layout.worker.ts", import.meta.url),
 *     { type: "module" })`), receives `{ id, root, options }`, runs ELK,
 *     posts back `{ id, ok: true, root }` or `{ id, ok: false, error }`.
 *
 * Cache: layout output is keyed by `(graphHash, expandedHash)` and stored
 * in a tiny LRU (default size 8). Pan/zoom never re-runs layout because
 * `(filtered, expanded)` change-detection in `GraphCanvas.tsx` is the only
 * thing that bumps the cache key. Cache lives on the worker side; the
 * main-thread fallback path uses the same module-scope cache, which is
 * fine because that path is only used in jsdom tests.
 *
 * Algorithm choice (v3): `mrtree` for true dendrogram aesthetic
 * (DECISIONS.md 2026-04-22). `layered` is preserved as an alternate option
 * for any future "compact width" follow-up.
 */
import ELK from "elkjs/lib/elk.bundled.js";

export interface ElkNode {
  id: string;
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  children?: ElkNode[];
  edges?: Array<{ id: string; sources: string[]; targets: string[] }>;
  layoutOptions?: Record<string, string>;
}

export type ElkAlgorithm = "mrtree" | "layered";

export interface ComputeOptions {
  algorithm: ElkAlgorithm;
  /** Cache key — when omitted, result is not cached. */
  cacheKey?: string;
}

// ---------------------------------------------------------------------------
// LRU cache (insertion-order Map). Lives at module scope so the worker side
// keeps a hot cache across messages and the main-thread fallback path
// memoizes between renders.
// ---------------------------------------------------------------------------
const CACHE_SIZE = 8;
const cache = new Map<string, ElkNode>();

function cacheGet(key: string): ElkNode | undefined {
  const v = cache.get(key);
  if (v === undefined) return undefined;
  // Bump recency: delete + reinsert so insertion order = recency order.
  cache.delete(key);
  cache.set(key, v);
  return v;
}

function cacheSet(key: string, value: ElkNode): void {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, value);
  while (cache.size > CACHE_SIZE) {
    // Map insertion-order iteration: first key is least-recently-used.
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

/** Test-only escape hatch — exported so vitest can reset between cases. */
export function __clearLayoutCache(): void {
  cache.clear();
}

/**
 * Run ELK on an ElkNode tree. Algorithm controlled by `options.algorithm`.
 * `mrtree` is the v3 default for tree mode; `layered` (Sugiyama-style) is
 * preserved as an alternate.
 */
export async function computeElkLayout(
  root: ElkNode,
  options: ComputeOptions = { algorithm: "mrtree" },
): Promise<ElkNode> {
  if (options.cacheKey) {
    const hit = cacheGet(options.cacheKey);
    if (hit) return hit;
  }

  const elk = new ELK();
  const layoutOptions: Record<string, string> =
    options.algorithm === "mrtree"
      ? {
          // mrtree = "Mr. Tree" — strict dendrogram; ignores cross-edges
          // for layout purposes (which is what we want — config edges are
          // overlaid AFTER layout completes).
          "elk.algorithm": "mrtree",
          "elk.direction": "RIGHT",
          "elk.spacing.nodeNode": "40",
          "elk.mrtree.searchOrder": "DFS",
        }
      : {
          "elk.algorithm": "layered",
          "elk.hierarchyHandling": "INCLUDE_CHILDREN",
          "elk.direction": "RIGHT",
          "elk.layered.spacing.nodeNodeBetweenLayers": "60",
          "elk.spacing.nodeNode": "40",
        };

  const result = (await elk.layout(root, { layoutOptions })) as ElkNode;
  if (options.cacheKey) cacheSet(options.cacheKey, result);
  return result;
}

// ---------------------------------------------------------------------------
// Worker dispatch — only registers when this module is actually evaluated
// inside a Worker context (where `self` exists and onmessage is settable).
// In a regular import (Vitest, SSR, main-thread fallback) this block is a
// no-op, which is what allows `tree-layout.ts` to call `computeElkLayout`
// directly when Worker is unavailable.
// ---------------------------------------------------------------------------
declare const self: unknown;

interface WorkerRequest {
  id: number;
  root: ElkNode;
  options?: ComputeOptions;
}

interface WorkerSelf {
  onmessage: ((ev: { data: WorkerRequest }) => void) | null;
  postMessage: (
    msg:
      | { id: number; ok: true; root: ElkNode }
      | { id: number; ok: false; error: string },
  ) => void;
}

function isWorkerScope(s: unknown): s is WorkerSelf {
  if (typeof s !== "object" || s === null) return false;
  const w = s as Record<string, unknown>;
  return typeof w.postMessage === "function" && "onmessage" in w;
}

if (typeof self !== "undefined" && isWorkerScope(self)) {
  self.onmessage = (ev: { data: WorkerRequest }) => {
    const { id, root, options } = ev.data;
    computeElkLayout(root, options ?? { algorithm: "mrtree" })
      .then((laid) => {
        (self as WorkerSelf).postMessage({ id, ok: true, root: laid });
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        (self as WorkerSelf).postMessage({ id, ok: false, error: message });
      });
  };
}
