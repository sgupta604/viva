/**
 * Cluster-aware layout builder.
 *
 * Pure function: given a v2 Graph + the current expanded-cluster set, returns a
 * positioned node + edge list ready for React Flow consumption.
 *
 * Key design rules (research + plan lessons):
 *  1. **Virtualize collapsed-cluster children by omission** (not `hidden:true`).
 *     Research Risk #1: React Flow pays DOM cost for every node in `nodes[]`
 *     even when hidden. Omitting keeps visible-DOM count ≤ top-level-cluster-
 *     count at default zoom, which is the critical 30-FPS lever.
 *  2. **Deterministic** — same input ⇒ same output. Enables caching + stable
 *     Playwright assertions.
 *  3. **Cross-cluster edge retargeting** — when an edge crosses a boundary
 *     whose endpoint is not a visible node, retarget it up the cluster chain
 *     to the nearest visible ancestor so the edge remains drawable.
 *  4. **Synchronous for now.** elkjs-in-Worker is wired via `layout.worker.ts`;
 *     the pure math here runs on the main thread. The Worker path produces
 *     aesthetically-better positions for larger graphs but is not required
 *     for correctness — Playwright and Vitest drive this sync path.
 *
 * Layout heuristic (sync): recursive grid packing.
 *   - Top-level clusters flow left-to-right across CLUSTERS_PER_ROW columns.
 *   - Inside an EXPANDED cluster:
 *       * sub-clusters (themselves collapsible) are laid out first in a grid
 *       * child files are laid out below the sub-cluster grid, also in a grid
 *       * the recursion descends based on each sub-cluster's own expanded flag
 *   - Collapsed clusters render as COLLAPSED_CLUSTER_W × COLLAPSED_CLUSTER_H tiles
 *     and omit their descendants from `nodes[]` entirely (virtualization).
 *   - Container size is computed bottom-up from laid-out descendants, so the
 *     React Flow compound node is big enough to contain them.
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

export interface LaidOutGraphNode {
  id: string;
  kind: "cluster" | "file";
  x: number;
  y: number;
  width: number;
  height: number;
  /** Parent cluster id (matches React Flow `parentNode`); null at top level. */
  parent: string | null;
  /** File nodes: the original FileNode. Cluster nodes: the ClusterNode. */
  file?: FileNode;
  cluster?: ClusterNode;
  /** Collapsed/expanded flag for cluster nodes; file nodes always undefined. */
  expanded?: boolean;
  /** Count of direct child files inside a cluster (retained for debugging / tests). */
  childCount?: number;
  /**
   * Total file count in this cluster's ENTIRE subtree (direct children +
   * recursive descendants across every sub-cluster). THIS is what the
   * ClusterNode badge displays — direct-only counts read misleadingly as `0`
   * for parent clusters whose files live in nested sub-folders (BLOCKER 2).
   */
  totalDescendantFiles?: number;
}

/**
 * Aggregated-or-direct edge. When both endpoints land on cluster ids (because
 * one or both endpoints were retargeted), the renderer knows to draw a
 * cluster-level aggregated edge.
 */
export interface LaidOutGraphEdge {
  id: string;
  source: string;
  target: string;
  kind: Edge["kind"];
  unresolved: string | null;
  /** How many original edges this aggregated edge represents (≥1). */
  count: number;
  /** Kind-breakdown when aggregated; for direct edges this is just {kind: 1}. */
  kindBreakdown: Record<Edge["kind"], number>;
  attrs?: Edge["attrs"];
}

export interface LaidOutClusterGraph {
  nodes: LaidOutGraphNode[];
  edges: LaidOutGraphEdge[];
}

const CLUSTER_COL_GAP = 80;
const CLUSTER_ROW_GAP = 80;
const INNER_COL_GAP = 24;
const INNER_ROW_GAP = 24;
const CLUSTERS_PER_ROW = 5;

/** Grid size for children (files or sub-clusters) inside an expanded cluster. */
const FILES_PER_ROW = 3;
const SUBCLUSTERS_PER_ROW = 3;

/**
 * Compute cluster layout. See module doc.
 *
 * @param graph         v2 graph (clusters[] may be empty — tolerated).
 * @param expanded      Set of cluster paths currently expanded.
 */
export function computeClusterLayout(
  graph: Graph,
  expanded: Set<string>,
): LaidOutClusterGraph {
  const clusters = graph.clusters ?? [];
  const clustersByPath = new Map<string, ClusterNode>();
  for (const c of clusters) clustersByPath.set(c.path, c);

  const filesById = new Map<string, FileNode>();
  for (const f of graph.files) filesById.set(f.id, f);

  // Map each file id to the ordered chain of cluster paths from leaf cluster
  // up to top-level, e.g. ["a/b/c", "a/b", "a"]. Used for edge retargeting —
  // we walk the chain and pick the nearest ancestor currently visible.
  const fileToClusterChain = buildFileToClusterChain(graph, clusters, clustersByPath);

  // BLOCKER 2 fix — precompute "files anywhere in subtree" for every cluster
  // so the badge shows a meaningful number even when a cluster owns no direct
  // files (e.g. `crawler` whose 40+ fixtures live under tests/fixtures/**).
  const descendantCountByPath = buildDescendantFileCounts(clusters, clustersByPath);

  const nodes: LaidOutGraphNode[] = [];

  const topClusters = clusters
    .filter((c) => c.parent === null)
    .slice()
    .sort((a, b) => a.path.localeCompare(b.path));

  // Top-level packing: row-of-grids.
  let rowHeight = 0;
  let colX = 0;
  let baseY = 0;
  let colIdx = 0;

  for (const cluster of topClusters) {
    // Recursive pass — compute this cluster AND all of its expanded
    // descendants in a temp array with positions RELATIVE to this cluster.
    const { width, height, descendants } = layoutCluster(
      cluster,
      clustersByPath,
      filesById,
      expanded,
      descendantCountByPath,
    );

    // Wrap to next row if we've placed CLUSTERS_PER_ROW at this level.
    if (colIdx >= CLUSTERS_PER_ROW) {
      colIdx = 0;
      colX = 0;
      baseY += rowHeight + CLUSTER_ROW_GAP;
      rowHeight = 0;
    }

    // Emit the top cluster at (colX, baseY); its descendants use parentNode
    // relationships so React Flow treats their positions as relative.
    nodes.push({
      id: cluster.path,
      kind: "cluster",
      x: colX,
      y: baseY,
      width,
      height,
      parent: null,
      cluster,
      expanded: expanded.has(cluster.path),
      childCount: (cluster.childFiles ?? []).length,
      totalDescendantFiles: descendantCountByPath.get(cluster.path) ?? 0,
    });
    // Descendants are already positioned relative to their immediate parent
    // cluster (React Flow compound-node convention), so we push them verbatim.
    for (const d of descendants) nodes.push(d);

    colX += width + CLUSTER_COL_GAP;
    rowHeight = Math.max(rowHeight, height);
    colIdx += 1;
  }

  // Edge pass — retarget to clusters when endpoint isn't a visible node,
  // walking up to the NEAREST visible ancestor (not blindly the top cluster).
  const visibleIds = new Set(nodes.map((n) => n.id));
  const edges = retargetEdges(graph.edges, {
    visibleIds,
    fileToClusterChain,
  });

  return { nodes, edges };
}

/**
 * Lay out a single cluster and (if expanded) its descendants.
 *
 * Returns the cluster's own width/height plus a flat list of descendant nodes
 * with positions RELATIVE to this cluster (React Flow `parentNode` convention).
 * The caller places THIS cluster wherever it likes; the descendants follow
 * automatically because their coordinates are parent-relative.
 */
function layoutCluster(
  cluster: ClusterNode,
  clustersByPath: Map<string, ClusterNode>,
  filesById: Map<string, FileNode>,
  expanded: Set<string>,
  descendantCountByPath: Map<string, number>,
): { width: number; height: number; descendants: LaidOutGraphNode[] } {
  const isExpanded = expanded.has(cluster.path);
  if (!isExpanded) {
    return {
      width: COLLAPSED_CLUSTER_W,
      height: COLLAPSED_CLUSTER_H,
      descendants: [],
    };
  }

  // Resolve direct children.
  const childClusters = (cluster.childClusters ?? [])
    .map((p) => clustersByPath.get(p))
    .filter((c): c is ClusterNode => !!c)
    .slice()
    .sort((a, b) => a.path.localeCompare(b.path));
  const childFiles = (cluster.childFiles ?? [])
    .map((id) => filesById.get(id))
    .filter((f): f is FileNode => !!f);

  const descendants: LaidOutGraphNode[] = [];

  // ------------------------------------------------------------------
  // Sub-cluster row
  // ------------------------------------------------------------------
  // Recurse first so we know each sub-cluster's laid-out dimensions (the
  // bottom-up MEASURE pass), then pack them in a grid using those measured
  // sizes (the top-down PLACE pass). Row-major packing with variable row
  // heights — heterogeneous siblings (one expanded + several collapsed) still
  // land with stride = sibling's own measured width, so they never overlap.
  const subLayouts = childClusters.map((sub) => ({
    cluster: sub,
    ...layoutCluster(sub, clustersByPath, filesById, expanded, descendantCountByPath),
  }));

  let subRowStartY = CLUSTER_HEADER_HEIGHT + CLUSTER_PADDING;
  let subRowX = CLUSTER_PADDING;
  let subRowHeight = 0;
  let subColIdx = 0;
  let maxInnerRight = CLUSTER_PADDING;

  for (const sub of subLayouts) {
    if (subColIdx >= SUBCLUSTERS_PER_ROW) {
      subColIdx = 0;
      subRowX = CLUSTER_PADDING;
      subRowStartY += subRowHeight + INNER_ROW_GAP;
      subRowHeight = 0;
    }

    const subX = subRowX;
    const subY = subRowStartY;

    descendants.push({
      id: sub.cluster.path,
      kind: "cluster",
      x: subX,
      y: subY,
      width: sub.width,
      height: sub.height,
      parent: cluster.path,
      cluster: sub.cluster,
      expanded: expanded.has(sub.cluster.path),
      childCount: (sub.cluster.childFiles ?? []).length,
      totalDescendantFiles: descendantCountByPath.get(sub.cluster.path) ?? 0,
    });
    // sub.descendants are positioned relative to `sub.cluster`, so we can
    // emit them as-is (their `parent` already points at sub.cluster.path).
    for (const d of sub.descendants) descendants.push(d);

    // Stride = this sibling's MEASURED width (not a constant tile size), so
    // an expanded sibling pushes the next collapsed sibling past its right
    // edge — no more pixel overlap (BLOCKER 1).
    subRowX += sub.width + INNER_COL_GAP;
    subRowHeight = Math.max(subRowHeight, sub.height);
    maxInnerRight = Math.max(maxInnerRight, subX + sub.width);
    subColIdx += 1;
  }

  // Baseline for the files row: directly below the last sub-cluster row.
  const filesStartY =
    subLayouts.length > 0
      ? subRowStartY + subRowHeight + INNER_ROW_GAP
      : CLUSTER_HEADER_HEIGHT + CLUSTER_PADDING;

  // ------------------------------------------------------------------
  // File row
  // ------------------------------------------------------------------
  childFiles.forEach((f, idx) => {
    const row = Math.floor(idx / FILES_PER_ROW);
    const col = idx % FILES_PER_ROW;
    const x = CLUSTER_PADDING + col * (NODE_W + INNER_COL_GAP);
    const y = filesStartY + row * (NODE_H + INNER_ROW_GAP);
    descendants.push({
      id: f.id,
      kind: "file",
      x,
      y,
      width: NODE_W,
      height: NODE_H,
      parent: cluster.path,
      file: f,
    });
    maxInnerRight = Math.max(maxInnerRight, x + NODE_W);
  });

  const fileRows = Math.ceil(childFiles.length / FILES_PER_ROW);
  const filesBottom =
    childFiles.length > 0
      ? filesStartY + fileRows * NODE_H + (fileRows - 1) * INNER_ROW_GAP
      : filesStartY - INNER_ROW_GAP; // cancel the INNER_ROW_GAP we added above

  // Compute container size from laid-out descendants.
  const minInnerWidth = FILES_PER_ROW * NODE_W + (FILES_PER_ROW - 1) * INNER_COL_GAP;
  const innerWidth = Math.max(minInnerWidth, maxInnerRight - CLUSTER_PADDING);
  const width = innerWidth + CLUSTER_PADDING * 2;
  const height = filesBottom + CLUSTER_PADDING;

  return { width, height, descendants };
}

/**
 * Total-subtree file count per cluster path. Bottom-up DFS — a cluster's total
 * is its direct childFiles + the total of each sub-cluster. Cycles are
 * tolerated (safety counter) even though the crawler emits a strict tree.
 *
 * The badge shown on every cluster reads from this map, not from
 * `childFiles.length` alone. Direct count was the BLOCKER 2 symptom: a parent
 * like `crawler` had childFiles=[] yet its subtree holds 40+ fixtures, so the
 * UI rendered a misleading "0".
 */
function buildDescendantFileCounts(
  clusters: ClusterNode[],
  clustersByPath: Map<string, ClusterNode>,
): Map<string, number> {
  const cache = new Map<string, number>();
  const visiting = new Set<string>();

  const walk = (path: string): number => {
    const cached = cache.get(path);
    if (cached !== undefined) return cached;
    if (visiting.has(path)) return 0; // cycle guard — defensive only
    visiting.add(path);
    const c = clustersByPath.get(path);
    if (!c) {
      visiting.delete(path);
      cache.set(path, 0);
      return 0;
    }
    let total = (c.childFiles ?? []).length;
    for (const childPath of c.childClusters ?? []) {
      total += walk(childPath);
    }
    visiting.delete(path);
    cache.set(path, total);
    return total;
  };

  for (const c of clusters) walk(c.path);
  return cache;
}

/**
 * For each file id, pre-compute the chain of cluster paths from its direct
 * parent cluster walking up to the top level. Used for edge retargeting:
 * we pick the FIRST path in the chain that's currently visible, so edges
 * attach to the deepest expanded ancestor (not blindly to the top).
 *
 *   fileToClusterChain.get("x") = ["a/b/c", "a/b", "a"]
 */
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
  // Files without a cluster → fall back to the first folder segment.
  for (const f of graph.files) {
    if (!map.has(f.id)) {
      const folderTop = (f.folder || "").split("/")[0] || f.folder;
      map.set(f.id, [folderTop]);
    }
  }
  return map;
}

interface RetargetCtx {
  visibleIds: Set<string>;
  fileToClusterChain: Map<string, string[]>;
}

/**
 * Resolve an edge endpoint to a visible node id:
 *   1. If the endpoint itself is visible (file inside an expanded cluster, or
 *      the cluster id itself when a sub-cluster is collapsed), use as-is.
 *   2. Otherwise walk the file's cluster chain (deepest → topmost) and return
 *      the first cluster path that IS visible. This is the "nearest visible
 *      ancestor" rule that makes nested-cluster edges show up at the right
 *      depth instead of collapsing to the top level.
 *   3. If nothing in the chain is visible, drop the endpoint (return null).
 */
function retargetEndpoint(id: string, ctx: RetargetCtx): string | null {
  if (ctx.visibleIds.has(id)) return id;
  const chain = ctx.fileToClusterChain.get(id);
  if (!chain) return null;
  for (const clusterPath of chain) {
    if (ctx.visibleIds.has(clusterPath)) return clusterPath;
  }
  return null;
}

/**
 * Rebuild the laid-out edge list:
 *  - Drop edges with a null (unresolved) target — those render separately.
 *  - Retarget cluster-crossing endpoints to the nearest visible ancestor.
 *  - Aggregate multiple  (source, target)  pairs into a single edge with a
 *    kind-breakdown tooltip (research Q9).
 *  - Drop self-loops (source === target after retarget) — collapsed clusters
 *    with purely-internal activity don't render an edge at this revision;
 *    an "internal activity" badge is a follow-up.
 */
function retargetEdges(
  edges: Edge[],
  ctx: RetargetCtx,
): LaidOutGraphEdge[] {
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
    if (e.target === null) continue; // unresolved — handled elsewhere
    const src = retargetEndpoint(e.source, ctx);
    const tgt = retargetEndpoint(e.target, ctx);
    if (!src || !tgt) continue;
    if (src === tgt) continue; // self-loop after aggregation — drop

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
