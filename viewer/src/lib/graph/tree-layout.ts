/**
 * Tree (dendrogram) layout — v3 default for graph mode.
 *
 * Pure async function. Same OUTPUT shape as `cluster-layout.ts`'s
 * `LaidOutClusterGraph` so `GraphCanvas.tsx` can branch on a single
 * `graphLayout` field without the React Flow node/edge wiring caring
 * which layout produced the positions.
 *
 * Key design rules (research + plan):
 *  1. **Cluster-as-node tree (Q1).** Folders become tree nodes; files
 *     become leaves of their immediate cluster. Matches the user's
 *     "Research Graph Datasets" reference image exactly. Keeps expand/
 *     collapse semantics uniform with cluster mode.
 *  2. **Off-main-thread via elk's OWN worker.** `computeElkLayout` (in
 *     `layout.worker.ts`) instantiates `elkjs/lib/elk-api.js` on the
 *     main thread and gives it a `workerFactory` that spawns elk's
 *     `elk-worker.min.js` as a classic Web Worker. The heavy GWT
 *     compute runs off-thread, but WE never own the worker — elk does.
 *     This sidesteps the "elk-worker.min.js hijacks self.onmessage"
 *     conflict that broke our previous "custom worker that imports
 *     elk.bundled" arrangement (see diagnosis 2026-04-22).
 *     In Vitest (jsdom, no `Worker`), `computeElkLayout` falls back to
 *     `elk.bundled.js` which runs on the main thread synchronously
 *     enough for tests.
 *  3. **Single source of truth for dimensions.** Reads `NODE_W` / `NODE_H`
 *     and the cluster constants from `lib/graph/layout.ts` — NEVER
 *     redeclares (xml-viewer-hardening 26f948f lesson).
 *  4. **mrtree ignores cross-edges for layout.** We only pass containment
 *     edges (parent-cluster → child) to ELK. Config edges (`include`,
 *     `ref`, `xsd`, ...) are drawn AFTER layout by React Flow at whatever
 *     positions ELK gave the endpoints — same retargeting machinery as
 *     cluster mode (`retargetEndpoint` here is identical in spirit).
 *  5. **Determinism.** Same `(graph, expanded)` ⇒ byte-identical output.
 *     `mrtree` with a fixed search order is deterministic; we sort
 *     children by path before marshaling so insertion order is stable.
 */
import type { Graph, FileNode, Edge, ClusterNode } from "./types";
import {
  NODE_W,
  NODE_H,
  CLUSTER_HEADER_HEIGHT,
  CLUSTER_PADDING,
  COLLAPSED_CLUSTER_W,
  COLLAPSED_CLUSTER_H,
} from "./layout";
import { computeElkLayout, type ElkNode } from "./layout.worker";
import type {
  LaidOutClusterGraph,
  LaidOutGraphNode,
  LaidOutGraphEdge,
} from "./cluster-layout";

// Re-export the laid-out shape so GraphCanvas can `import type` from one place
// once it switches to the type-erased layout interface (follow-up if useful).
export type { LaidOutClusterGraph, LaidOutGraphNode, LaidOutGraphEdge };

// ---------------------------------------------------------------------------
// Edge retargeting (same logic as cluster-layout.ts; kept local to avoid
// cross-module coupling between two layout strategies).
// ---------------------------------------------------------------------------

interface RetargetCtx {
  visibleIds: Set<string>;
  fileToClusterChain: Map<string, string[]>;
}

function retargetEndpoint(id: string, ctx: RetargetCtx): string | null {
  if (ctx.visibleIds.has(id)) return id;
  const chain = ctx.fileToClusterChain.get(id);
  if (!chain) return null;
  for (const clusterPath of chain) {
    if (ctx.visibleIds.has(clusterPath)) return clusterPath;
  }
  return null;
}

function retargetEdges(edges: Edge[], ctx: RetargetCtx): LaidOutGraphEdge[] {
  interface Bucket {
    source: string;
    target: string;
    kinds: Record<Edge["kind"], number>;
    firstKind: Edge["kind"];
    firstAttrs?: Edge["attrs"];
    firstUnresolved: string | null;
  }

  const buckets = new Map<string, Bucket>();

  for (const e of edges) {
    if (e.target === null) continue;
    const src = retargetEndpoint(e.source, ctx);
    const tgt = retargetEndpoint(e.target, ctx);
    if (!src || !tgt) continue;
    if (src === tgt) continue;

    const key = `${src}->${tgt}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        source: src,
        target: tgt,
        kinds: {} as Record<Edge["kind"], number>,
        firstKind: e.kind,
        firstAttrs: e.attrs,
        firstUnresolved: e.unresolved,
      };
      buckets.set(key, bucket);
    }
    bucket.kinds[e.kind] = (bucket.kinds[e.kind] ?? 0) + 1;
  }

  let i = 0;
  return Array.from(buckets.values()).map((b) => {
    const total = Object.values(b.kinds).reduce((a, n) => a + n, 0);
    return {
      id: `${b.source}->${b.target}-${b.firstKind}-${i++}`,
      source: b.source,
      target: b.target,
      kind: b.firstKind,
      unresolved: b.firstUnresolved,
      count: total,
      kindBreakdown: b.kinds,
      attrs: b.firstAttrs,
    };
  });
}

function buildFileToClusterChain(
  graph: Graph,
  clusters: ClusterNode[],
  clustersByPath: Map<string, ClusterNode>,
): Map<string, string[]> {
  const chainOf = (path: string): string[] => {
    const out: string[] = [];
    let cur: ClusterNode | undefined = clustersByPath.get(path);
    let safety = 64;
    while (cur && safety > 0) {
      out.push(cur.path);
      if (cur.parent === null) break;
      cur = clustersByPath.get(cur.parent);
      safety -= 1;
    }
    return out;
  };

  const map = new Map<string, string[]>();
  for (const cluster of clusters) {
    const chain = chainOf(cluster.path);
    for (const fid of cluster.childFiles ?? []) {
      map.set(fid, chain);
    }
  }
  for (const f of graph.files) {
    if (!map.has(f.id)) {
      const folderTop = (f.folder || "").split("/")[0] || f.folder;
      map.set(f.id, [folderTop]);
    }
  }
  return map;
}

function buildDescendantFileCounts(
  clusters: ClusterNode[],
  clustersByPath: Map<string, ClusterNode>,
): Map<string, number> {
  const cache = new Map<string, number>();
  const visiting = new Set<string>();
  const walk = (path: string): number => {
    const cached = cache.get(path);
    if (cached !== undefined) return cached;
    if (visiting.has(path)) return 0;
    visiting.add(path);
    const c = clustersByPath.get(path);
    if (!c) {
      visiting.delete(path);
      cache.set(path, 0);
      return 0;
    }
    let total = (c.childFiles ?? []).length;
    for (const childPath of c.childClusters ?? []) total += walk(childPath);
    visiting.delete(path);
    cache.set(path, total);
    return total;
  };
  for (const c of clusters) walk(c.path);
  return cache;
}

// ---------------------------------------------------------------------------
// ELK marshal — turn the (graph, expanded) pair into an ElkNode containment
// tree. Each node carries an explicit width/height so ELK lays them out
// correctly without re-measuring DOM.
// ---------------------------------------------------------------------------

interface VisibleEntry {
  id: string;
  kind: "cluster" | "file";
  cluster?: ClusterNode;
  file?: FileNode;
  expanded?: boolean;
  childCount?: number;
  totalDescendantFiles?: number;
  /** Children to recurse into (populated only when expanded). */
  childClusters: VisibleEntry[];
  childFiles: VisibleEntry[];
  /** Width / height ELK should reserve for this node (leaf size). */
  width: number;
  height: number;
}

function buildVisibleTree(
  graph: Graph,
  expanded: Set<string>,
): {
  topLevel: VisibleEntry[];
  descendantCountByPath: Map<string, number>;
} {
  const clusters = (graph.clusters ?? []).slice();
  const clustersByPath = new Map<string, ClusterNode>();
  for (const c of clusters) clustersByPath.set(c.path, c);

  const filesById = new Map<string, FileNode>();
  for (const f of graph.files) filesById.set(f.id, f);

  const descendantCountByPath = buildDescendantFileCounts(clusters, clustersByPath);

  const buildCluster = (c: ClusterNode): VisibleEntry => {
    const isExpanded = expanded.has(c.path);
    const entry: VisibleEntry = {
      id: c.path,
      kind: "cluster",
      cluster: c,
      expanded: isExpanded,
      childCount: (c.childFiles ?? []).length,
      totalDescendantFiles: descendantCountByPath.get(c.path) ?? 0,
      childClusters: [],
      childFiles: [],
      // Size used by ELK when this cluster is collapsed (leaf). When
      // expanded, ELK computes container size from descendants.
      width: COLLAPSED_CLUSTER_W,
      height: COLLAPSED_CLUSTER_H,
    };
    if (!isExpanded) return entry;

    const childClusterPaths = (c.childClusters ?? []).slice().sort();
    for (const p of childClusterPaths) {
      const sub = clustersByPath.get(p);
      if (sub) entry.childClusters.push(buildCluster(sub));
    }
    const childFileIds = (c.childFiles ?? []).slice().sort();
    for (const fid of childFileIds) {
      const f = filesById.get(fid);
      if (!f) continue;
      entry.childFiles.push({
        id: f.id,
        kind: "file",
        file: f,
        childClusters: [],
        childFiles: [],
        width: NODE_W,
        height: NODE_H,
      });
    }
    return entry;
  };

  const topLevel = clusters
    .filter((c) => c.parent === null)
    .slice()
    .sort((a, b) => a.path.localeCompare(b.path))
    .map(buildCluster);

  return { topLevel, descendantCountByPath };
}

function toElkNode(entry: VisibleEntry): ElkNode {
  // Leaf: collapsed cluster or file → fixed reserved size, no children.
  if (entry.childClusters.length === 0 && entry.childFiles.length === 0) {
    return {
      id: entry.id,
      width: entry.width,
      height: entry.height,
    };
  }
  // Expanded cluster: reserve header strip via padding so the cluster's
  // title bar doesn't overlap children. mrtree honors per-node
  // `elk.padding`.
  return {
    id: entry.id,
    layoutOptions: {
      "elk.padding": `[top=${CLUSTER_HEADER_HEIGHT + CLUSTER_PADDING},left=${CLUSTER_PADDING},bottom=${CLUSTER_PADDING},right=${CLUSTER_PADDING}]`,
    },
    children: [
      ...entry.childClusters.map(toElkNode),
      ...entry.childFiles.map(toElkNode),
    ],
  };
}

/**
 * Post-ELK bottom-up bbox tightening pass.
 *
 * **Why this exists.** Tree-mode containment overflow (Bug #1, image #16):
 * when a sub-cluster is expanded inside a parent, the parent's `width`/
 * `height` from ELK didn't always cover the expanded child's extents. The
 * symptom in the browser was a child cluster's tile bursting through the
 * bottom edge of its parent box and visually colliding with the next row of
 * top-level clusters. On the xlarge fixture (4,794 nodes) reproducing this
 * with `top00 > mid00 expanded` produced a 32px right-overflow + 192px
 * bottom-overflow at the React Flow node-coordinate level.
 *
 * **Root cause.** ELK mrtree honors the per-node `elk.padding` we pass for
 * expanded clusters, but doesn't always grow the parent enough when a
 * descendant's subtree expands at the same call. The leaf widths/heights
 * we pass for COLLAPSED clusters reserve the right amount; for an EXPANDED
 * cluster (no width/height passed), ELK computes the container size — but
 * not always tight enough to contain a deeply-expanded grandchild whose
 * own bbox came back with extra slack. So we walk the result tree
 * bottom-up after layout and tighten each compound node's dimensions to
 * `max(child.x + child.width) + padding` so containment is guaranteed.
 *
 * **Why the bottom-up walk.** A child's tightened size feeds into the
 * parent's tightened size. Walking children-first ensures we read the
 * child's true post-tightening bbox when computing the parent.
 *
 * **Padding.** `CLUSTER_HEADER_HEIGHT + CLUSTER_PADDING` on top, `CLUSTER_PADDING`
 * on the other three sides — same per-side budget the ELK input declares
 * via `elk.padding`. Any drift between this and `toElkNode` is itself a
 * bug, hence the constants are imported from the same `layout.ts` source.
 *
 * Pure / idempotent — runs in-place on the ElkNode tree but the same input
 * always produces the same output. Safe to memoize at the caller.
 */
function tightenContainmentBboxes(node: ElkNode): void {
  if (!node.children || node.children.length === 0) return;
  // Recurse first so children sizes are already tightened.
  for (const child of node.children) tightenContainmentBboxes(child);

  // Compute the union right/bottom of all children. Children with no
  // explicit position (shouldn't happen post-ELK, but defensive) contribute
  // nothing and are skipped.
  let maxRight = 0;
  let maxBottom = 0;
  for (const child of node.children) {
    const cx = child.x ?? 0;
    const cy = child.y ?? 0;
    const cw = child.width ?? 0;
    const ch = child.height ?? 0;
    if (cx + cw > maxRight) maxRight = cx + cw;
    if (cy + ch > maxBottom) maxBottom = cy + ch;
  }

  // Required size = union extent + right/bottom padding.
  // Top + left padding is already baked into child.x / child.y by ELK
  // (because we passed `elk.padding` with top/left values).
  const requiredW = maxRight + CLUSTER_PADDING;
  const requiredH = maxBottom + CLUSTER_PADDING;

  // GROW only — never shrink. ELK may already have given the parent more
  // width than its children need (mrtree centers ranks symmetrically and
  // sometimes pads); shrinking that down would cause sibling overlap at
  // the parent-of-parent level.
  const currentW = node.width ?? 0;
  const currentH = node.height ?? 0;
  if (requiredW > currentW) node.width = requiredW;
  if (requiredH > currentH) node.height = requiredH;
}

function flattenLaidOut(
  laid: ElkNode,
  visibleIndex: Map<string, VisibleEntry>,
  parent: string | null,
  out: LaidOutGraphNode[],
): void {
  const entry = visibleIndex.get(laid.id);
  if (!entry) return;

  // ELK absolute positions are relative to the parent; React Flow's
  // parentNode convention is the same, so we can pass them through.
  const x = laid.x ?? 0;
  const y = laid.y ?? 0;
  const width =
    laid.width ?? (entry.kind === "file" ? NODE_W : COLLAPSED_CLUSTER_W);
  const height =
    laid.height ?? (entry.kind === "file" ? NODE_H : COLLAPSED_CLUSTER_H);

  if (entry.kind === "cluster") {
    out.push({
      id: entry.id,
      kind: "cluster",
      x,
      y,
      width,
      height,
      parent,
      cluster: entry.cluster!,
      expanded: entry.expanded ?? false,
      childCount: entry.childCount ?? 0,
      totalDescendantFiles: entry.totalDescendantFiles ?? 0,
    });
  } else {
    out.push({
      id: entry.id,
      kind: "file",
      x,
      y,
      width,
      height,
      parent,
      file: entry.file!,
    });
  }

  for (const child of laid.children ?? []) {
    flattenLaidOut(child, visibleIndex, laid.id, out);
  }
}

function indexVisible(top: VisibleEntry[]): Map<string, VisibleEntry> {
  const map = new Map<string, VisibleEntry>();
  const walk = (e: VisibleEntry) => {
    map.set(e.id, e);
    for (const c of e.childClusters) walk(c);
    for (const f of e.childFiles) walk(f);
  };
  for (const e of top) walk(e);
  return map;
}

// ---------------------------------------------------------------------------
// Top-level row packing for the multiple top-level cluster case. mrtree
// would otherwise stack them vertically; we want a left-to-right flow so
// the dendrogram fans out across the canvas.
// ---------------------------------------------------------------------------

const TOP_LEVEL_GAP_X = 80;
const TOP_LEVEL_GAP_Y = 80;
const TOP_LEVEL_PER_ROW = 5;

function packTopLevel(roots: ElkNode[]): void {
  let rowHeight = 0;
  let colX = 0;
  let baseY = 0;
  let colIdx = 0;
  for (const r of roots) {
    if (colIdx >= TOP_LEVEL_PER_ROW) {
      colIdx = 0;
      colX = 0;
      baseY += rowHeight + TOP_LEVEL_GAP_Y;
      rowHeight = 0;
    }
    r.x = colX;
    r.y = baseY;
    const w = r.width ?? COLLAPSED_CLUSTER_W;
    const h = r.height ?? COLLAPSED_CLUSTER_H;
    colX += w + TOP_LEVEL_GAP_X;
    rowHeight = Math.max(rowHeight, h);
    colIdx += 1;
  }
}

// ---------------------------------------------------------------------------
// Cache key — stable hash of (cluster set, file set, expanded set).
// Production-grade hashing isn't needed; we just need byte-identical input
// to produce the same key.
// ---------------------------------------------------------------------------

function cacheKeyFor(graph: Graph, expanded: Set<string>): string {
  const clusterIds = (graph.clusters ?? [])
    .map((c) => c.path)
    .sort()
    .join("|");
  const fileIds = graph.files
    .map((f) => f.id)
    .sort()
    .join("|");
  const expandedKey = Array.from(expanded).sort().join("|");
  // Cheap rolling hash — good enough for an LRU bucket key, NOT a security
  // primitive. Using string concatenation directly would blow up cache key
  // size on a 3k-file graph.
  return `${djb2(clusterIds)}-${djb2(fileIds)}-${djb2(expandedKey)}`;
}

function djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

// ---------------------------------------------------------------------------
// Public entry point.
// ---------------------------------------------------------------------------

export async function computeTreeLayout(
  graph: Graph,
  expanded: Set<string>,
): Promise<LaidOutClusterGraph> {
  const clusters = graph.clusters ?? [];
  const clustersByPath = new Map<string, ClusterNode>();
  for (const c of clusters) clustersByPath.set(c.path, c);

  const fileToClusterChain = buildFileToClusterChain(
    graph,
    clusters,
    clustersByPath,
  );

  const { topLevel } = buildVisibleTree(graph, expanded);
  if (topLevel.length === 0) {
    return { nodes: [], edges: [] };
  }

  const visibleIndex = indexVisible(topLevel);

  // Lay out each top-level cluster independently (mrtree per root), then
  // pack them into rows so multiple top-level clusters flow LTR.
  const cacheKey = cacheKeyFor(graph, expanded);
  const elkRoots: ElkNode[] = [];
  for (let i = 0; i < topLevel.length; i++) {
    const elkInput = toElkNode(topLevel[i]);
    const laid = await computeElkLayout(elkInput, {
      algorithm: "mrtree",
      cacheKey: `${cacheKey}/root-${i}`,
    });
    // Bug #1 (image #16) — tighten compound-node bboxes bottom-up so an
    // expanded sub-cluster never overflows its parent. mrtree's container
    // sizing isn't always tight enough for nested expansions; this fixes
    // it without changing any leaf positions.
    tightenContainmentBboxes(laid);
    elkRoots.push(laid);
  }
  packTopLevel(elkRoots);

  const nodes: LaidOutGraphNode[] = [];
  for (const root of elkRoots) {
    flattenLaidOut(root, visibleIndex, null, nodes);
  }

  const visibleIds = new Set(nodes.map((n) => n.id));
  const edges = retargetEdges(graph.edges, {
    visibleIds,
    fileToClusterChain,
  });

  return { nodes, edges };
}
