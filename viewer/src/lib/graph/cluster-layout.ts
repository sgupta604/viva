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
 *     whose endpoint cluster is collapsed, retarget that endpoint to the
 *     cluster path so the edge remains visible.
 *  4. **Synchronous for now.** elkjs-in-Worker is wired via `layout.worker.ts`;
 *     the pure math here runs on the main thread. The Worker path produces
 *     aesthetically-better positions for larger graphs but is not required
 *     for correctness — Playwright and Vitest drive this sync path.
 *
 * Layout heuristic (sync): simple grid packing.
 *   - Clusters arranged in a row (top-level only; nested cluster support is
 *     a v2.1 extension — not needed for current fixtures).
 *   - Files inside an expanded cluster arranged in a grid.
 *   - Collapsed clusters render as COLLAPSED_CLUSTER_W × COLLAPSED_CLUSTER_H tiles.
 *   - Expanded clusters size to fit their children + CLUSTER_HEADER_HEIGHT.
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
  /** File nodes: the parent cluster id (matches React Flow `parentNode`). */
  parent: string | null;
  /** File nodes: the original FileNode. Cluster nodes: the ClusterNode. */
  file?: FileNode;
  cluster?: ClusterNode;
  /** Collapsed/expanded flag for cluster nodes; file nodes always undefined. */
  expanded?: boolean;
  /** Count of files inside a cluster (for badge in ClusterNode header). */
  childCount?: number;
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

/** Grid size for files inside an expanded cluster. Keeps width bounded. */
const FILES_PER_ROW = 3;

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
  // Top-level clusters first. Nested clusters are kept in the list but laid
  // out via their parent's grid.
  const topClusters = clusters
    .filter((c) => c.parent === null)
    .slice()
    .sort((a, b) => a.path.localeCompare(b.path));

  const filesById = new Map<string, FileNode>();
  for (const f of graph.files) filesById.set(f.id, f);

  // Map each file id to its owning top-level cluster path. Used for
  // cross-cluster edge retargeting.
  const fileToTopCluster = buildFileToTopCluster(graph, clusters);

  const nodes: LaidOutGraphNode[] = [];

  // Layout pass — simple row-of-grids packing.
  let rowHeight = 0;
  let colX = 0;
  let baseY = 0;
  let colIdx = 0;

  for (const cluster of topClusters) {
    const isExpanded = expanded.has(cluster.path);
    const childFiles = (cluster.childFiles ?? [])
      .map((id) => filesById.get(id))
      .filter((f): f is FileNode => !!f);

    let clusterW: number;
    let clusterH: number;

    if (!isExpanded) {
      clusterW = COLLAPSED_CLUSTER_W;
      clusterH = COLLAPSED_CLUSTER_H;
    } else {
      const rows = Math.max(1, Math.ceil(childFiles.length / FILES_PER_ROW));
      const innerW =
        FILES_PER_ROW * NODE_W +
        (FILES_PER_ROW - 1) * INNER_COL_GAP;
      clusterW = innerW + CLUSTER_PADDING * 2;
      clusterH =
        CLUSTER_HEADER_HEIGHT +
        CLUSTER_PADDING * 2 +
        rows * NODE_H +
        (rows - 1) * INNER_ROW_GAP;
    }

    // Wrap to next row
    if (colIdx >= CLUSTERS_PER_ROW) {
      colIdx = 0;
      colX = 0;
      baseY += rowHeight + CLUSTER_ROW_GAP;
      rowHeight = 0;
    }

    const clusterX = colX;
    const clusterY = baseY;

    nodes.push({
      id: cluster.path,
      kind: "cluster",
      x: clusterX,
      y: clusterY,
      width: clusterW,
      height: clusterH,
      parent: cluster.parent,
      cluster,
      expanded: isExpanded,
      childCount: childFiles.length,
    });

    if (isExpanded) {
      childFiles.forEach((f, idx) => {
        const row = Math.floor(idx / FILES_PER_ROW);
        const col = idx % FILES_PER_ROW;
        nodes.push({
          id: f.id,
          kind: "file",
          x: CLUSTER_PADDING + col * (NODE_W + INNER_COL_GAP),
          y:
            CLUSTER_HEADER_HEIGHT +
            CLUSTER_PADDING +
            row * (NODE_H + INNER_ROW_GAP),
          width: NODE_W,
          height: NODE_H,
          parent: cluster.path,
          file: f,
        });
      });
    }

    colX += clusterW + CLUSTER_COL_GAP;
    rowHeight = Math.max(rowHeight, clusterH);
    colIdx += 1;
  }

  // Edge pass — retarget to clusters when endpoint is virtualized out.
  const visibleIds = new Set(nodes.map((n) => n.id));
  const edges = retargetEdges(graph.edges, {
    visibleIds,
    fileToTopCluster,
    expanded,
  });

  return { nodes, edges };
}

/**
 * Build a map  fileId → top-level cluster path  by walking cluster parents.
 * Files in nested clusters roll up to their top-level ancestor for
 * edge-retargeting purposes (same UX principle as collapsed-cluster edges:
 * whatever is visible gets the edge).
 */
function buildFileToTopCluster(
  graph: Graph,
  clusters: ClusterNode[],
): Map<string, string> {
  const clustersByPath = new Map<string, ClusterNode>();
  for (const c of clusters) clustersByPath.set(c.path, c);

  const topOf = (path: string): string => {
    let cur: ClusterNode | undefined = clustersByPath.get(path);
    let safety = 32;
    while (cur && cur.parent !== null && safety > 0) {
      cur = clustersByPath.get(cur.parent);
      safety -= 1;
    }
    return cur ? cur.path : path;
  };

  const map = new Map<string, string>();
  for (const cluster of clusters) {
    const top = topOf(cluster.path);
    for (const fid of cluster.childFiles ?? []) {
      map.set(fid, top);
    }
  }
  // Files without a cluster → top is their own folder (fallback).
  for (const f of graph.files) {
    if (!map.has(f.id)) {
      const folderTop = (f.folder || "").split("/")[0] || f.folder;
      map.set(f.id, folderTop);
    }
  }
  return map;
}

interface RetargetCtx {
  visibleIds: Set<string>;
  fileToTopCluster: Map<string, string>;
  expanded: Set<string>;
}

function retargetEndpoint(id: string, ctx: RetargetCtx): string | null {
  // If the id is already a visible node (file or cluster), use it as-is.
  if (ctx.visibleIds.has(id)) return id;
  // Otherwise roll up to the owning top-level cluster.
  const topCluster = ctx.fileToTopCluster.get(id);
  if (topCluster && ctx.visibleIds.has(topCluster)) return topCluster;
  return null;
}

/**
 * Rebuild the laid-out edge list:
 *  - Drop edges with a null (unresolved) target — those render separately.
 *  - Retarget cluster-crossing endpoints to the cluster id when the file is
 *    not visible.
 *  - Aggregate multiple  (sourceCluster, targetCluster)  pairs into a single
 *    edge with a kind-breakdown tooltip (research Q9).
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
