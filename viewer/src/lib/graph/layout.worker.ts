/**
 * Tree-layout engine — main-thread orchestration of elkjs.
 *
 * NOTE on the filename: this file used to be a Web Worker entry point
 * (`new Worker(new URL("./layout.worker.ts", ...), { type: "module" })`).
 * That layout was wrong: importing `elkjs/lib/elk.bundled.js` INSIDE a
 * Web Worker triggers elk's bundled `elk-worker.min.js` to hijack
 * `self.onmessage` at module load, racing our handler and (on the
 * `vite preview` IIFE bundling path) causing `new ELK()` to throw
 * `Cannot construct an ELK without both 'workerUrl' and 'workerFactory'.`
 * See `.claude/features/tree-layout-redesign/2026-04-22T00-00-00_diagnosis.md`.
 *
 * The fix: orchestrate ELK from the MAIN thread and let elk spawn its
 * OWN internal Web Worker (the documented elkjs pattern). We pass
 * `workerFactory` explicitly so elk never falls into the broken
 * `require('./elk-worker.min.js')` auto-detect path. Off-main-thread
 * compute is preserved — the heavy GWT layout still runs in a worker,
 * just one elk owns and we don't.
 *
 * The filename stays `layout.worker.ts` because (a) call sites already
 * import from this path and (b) the file's job is still "everything
 * about driving the layout worker" — we just don't BE the worker
 * anymore. A clean rename can come as follow-up cleanup.
 *
 * Two entry points:
 *   - `computeElkLayout(root, options)` — pure async function used by
 *     `tree-layout.ts` for both production and Vitest. The same function
 *     handles the `Worker`-available browser path (elk-api + elk-worker.min)
 *     AND the `Worker`-undefined jsdom path (elk.bundled.js, which
 *     internally fakes a synchronous worker via Node `require`).
 *   - `__clearLayoutCache()` — test-only escape hatch to reset the LRU
 *     between Vitest cases.
 *
 * Cache: layout output is keyed by `(graphHash, expandedHash)` and stored
 * in a tiny LRU (default size 8). Pan/zoom never re-runs layout because
 * `(filtered, expanded)` change-detection in `GraphCanvas.tsx` is the only
 * thing that bumps the cache key.
 *
 * Algorithm choice (v3): `mrtree` for true dendrogram aesthetic
 * (DECISIONS.md 2026-04-22). `layered` is preserved as an alternate option
 * for any future "compact width" follow-up.
 */

// `?url` asks Vite to copy the file to /assets and return its URL string.
// Critically: Vite does NOT re-bundle this file (unlike `?worker`), so the
// elkjs author's already-built classic-worker payload reaches the browser
// untouched — no IIFE-vs-ESM mismatch, no @rollup/plugin-commonjs
// dynamic-require stub, no `worker.format: "es"` re-wrap. Construct it
// with `new Worker(url)` (NO `{ type: "module" }`), elk-worker.min.js is a
// classic UMD that self-installs `self.onmessage`.
//
// The `?url` suffix is processed by Vite's resolver. For Vitest we rely
// on the same Vite transform pipeline; if `Worker` is undefined (jsdom)
// we never call this factory, so the resolved URL is harmless.
import elkWorkerUrl from "elkjs/lib/elk-worker.min.js?url";

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
// LRU cache (insertion-order Map). Lives at module scope so calls across
// the same session share the hot cache.
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
  // Reset the lazily-constructed ELK so the next compute re-instantiates
  // with whatever `Worker` availability holds at call time. Tests that
  // mock Worker on/off between cases need this.
  elkInstance = null;
}

// ---------------------------------------------------------------------------
// ELK instantiation. Lazy + cached. Two paths:
//   1) Browser w/ Worker — use lightweight `elk-api.js` and pass an
//      explicit `workerFactory` that spawns elk's `elk-worker.min.js` as
//      a CLASSIC worker. Elk handles all message-passing internally.
//   2) jsdom / Node test runtime — `Worker` is undefined. Use the
//      `elk.bundled.js` self-contained module which can fall back to a
//      synchronous in-process resolver via the bundled-in `require`
//      shim. This is the path our existing Vitest suite exercises.
// ---------------------------------------------------------------------------

interface ElkLike {
  layout(
    root: ElkNode,
    args: { layoutOptions?: Record<string, string> },
  ): Promise<ElkNode>;
}

let elkInstance: ElkLike | null = null;

async function getElk(): Promise<ElkLike> {
  if (elkInstance) return elkInstance;

  if (typeof Worker !== "undefined") {
    // Browser path — main thread orchestrates, elk-worker runs the GWT
    // pipeline off-thread. This is the documented elkjs pattern.
    const apiMod = (await import("elkjs/lib/elk-api.js")) as unknown as {
      default: new (opts: {
        workerFactory: (url?: string) => Worker;
      }) => ElkLike;
    };
    const ELKApi = apiMod.default;
    elkInstance = new ELKApi({
      workerFactory: () => new Worker(elkWorkerUrl),
    });
    return elkInstance;
  }

  // jsdom / Node path — bundled is self-contained and falls back to
  // require()'ing its own elk-worker.min.js, which works in CJS test
  // runtimes (it does NOT work inside a Web Worker, hence the whole
  // refactor; but here we are NOT in a Web Worker).
  const bundledMod = (await import("elkjs/lib/elk.bundled.js")) as unknown as {
    default: new () => ElkLike;
  };
  const ELKBundled = bundledMod.default;
  elkInstance = new ELKBundled();
  return elkInstance;
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

  const elk = await getElk();
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
