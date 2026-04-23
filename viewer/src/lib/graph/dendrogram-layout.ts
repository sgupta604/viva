/**
 * Dendrogram layout — v3 default for graph mode (2026-04-22).
 *
 * Pure async function. Same OUTPUT shape as `cluster-layout.ts`'s
 * `LaidOutClusterGraph` so `GraphCanvas.tsx` can branch on a single
 * `graphLayout` field without the React Flow node/edge wiring caring
 * which layout produced the positions.
 *
 * What makes this DIFFERENT from `tree-layout.ts` (the second pill option):
 *
 *   1. **Flat node set, no containment.** Every visible folder + file is a
 *      top-level React Flow node (`parent === null`). The dendrogram
 *      expresses parent/child via DRAWN orthogonal hierarchy edges between
 *      sibling cards, NOT via box-in-box compound nodes. This is the
 *      defining visual property of the user's reference image
 *      (image copy.png — "Research Graph Datasets").
 *
 *   2. **Injected hierarchy edges.** For every (parent-folder, child-folder)
 *      and (folder, file) pair where BOTH are in the visible set, a
 *      synthetic `kind: "d-aggregate"` edge is emitted. The existing
 *      `treeEdgeStyleFor` in EdgeStyles.ts buckets `d-aggregate` into
 *      `TREE_HIERARCHY_COLOR` (slate-600), so these become the recessive
 *      grey backbone connectors. NO new EdgeKind needed in the graph
 *      schema (Q5 in the plan): the synthetic edges live only in the
 *      `LaidOutGraphEdge` output, not in the source `Graph`.
 *
 *   3. **Hierarchy edges drive ELK's mrtree layout.** They're passed AS the
 *      ELK input edges so mrtree treats them as the tree backbone. Cross-
 *      reference edges (`include`, `ref`, `import`, `xsd`, `logical-id`) are
 *      retargeted post-layout via `retargetEdges` and CONCATENATED after
 *      hierarchy edges so React Flow paints them ON TOP of the slate
 *      backbone (the cyan stays visible).
 *
 *   4. **Per-root mrtree, then row-pack.** Same `packTopLevel` strategy as
 *      `tree-layout.ts` (multiple top-level folders pack into a 5-per-row
 *      grid). NO virtual super-root — viva's graphs typically have 1–3
 *      top-level project folders, not dozens, and the reference image's
 *      "Research Graph Datasets" IS its top-level cluster, not a wrapper
 *      above one.
 *
 * Cache: keyed via the same shape as tree-layout but PREFIXED `dendrogram/`
 * so the LRU bucket holds both layouts simultaneously without collision.
 *
 * Determinism: same `(graph, expanded)` ⇒ byte-identical output. Sort
 * visible entries by id before marshaling; mrtree is deterministic with a
 * fixed search order.
 */
import type { Graph, FileNode, Edge, ClusterNode } from "./types";
import {
  TREE_FOLDER_W,
  TREE_FOLDER_H,
  TREE_FILE_W,
  TREE_FILE_H,
} from "./layout";
import { computeElkLayout, type ElkNode } from "./layout.worker";
import type {
  LaidOutClusterGraph,
  LaidOutGraphNode,
  LaidOutGraphEdge,
} from "./cluster-layout";

// Re-export for callers that want to type-erase against the unified shape.
export type { LaidOutClusterGraph, LaidOutGraphNode, LaidOutGraphEdge };

// ---------------------------------------------------------------------------
// Edge retargeting (same logic as tree-layout.ts; kept local to avoid
// cross-module coupling between two layout strategies — Q2 in the plan
// chose "copy with TODO" over a shared util for one helper).
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

/**
 * Retarget cross-ref edges + tally per-folder self-loops.
 *
 * Returns the visible cross-ref edges PLUS a per-folder count of edges
 * that self-loop at this folder (both endpoints rolled up to the same
 * visible folder card). The count drives the `↻ N` collapsed-folder
 * badge in TreeFolderNode — same affordance ClusterNode shows in cluster
 * mode (visual-review 2026-04-23).
 */
function retargetEdges(
  edges: Edge[],
  ctx: RetargetCtx,
): { edges: LaidOutGraphEdge[]; intraClusterEdgeCounts: Map<string, number> } {
  interface Bucket {
    source: string;
    target: string;
    kinds: Record<Edge["kind"], number>;
    firstKind: Edge["kind"];
    firstAttrs?: Edge["attrs"];
    firstUnresolved: string | null;
  }

  const buckets = new Map<string, Bucket>();
  const intraClusterEdgeCounts = new Map<string, number>();

  for (const e of edges) {
    if (e.target === null) continue;
    const src = retargetEndpoint(e.source, ctx);
    const tgt = retargetEndpoint(e.target, ctx);
    if (!src || !tgt) continue;
    if (src === tgt) {
      intraClusterEdgeCounts.set(src, (intraClusterEdgeCounts.get(src) ?? 0) + 1);
      continue;
    }

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
  const laidOutEdges = Array.from(buckets.values()).map((b) => {
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
  return { edges: laidOutEdges, intraClusterEdgeCounts };
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
// Visible-tree walk — produces a FLAT list of folder+file entries (no
// nesting in the OUTPUT). Recursion is internal only, used to walk the
// (cluster, expanded) tree top-down. A folder appears in `entries` whether
// or not it's expanded; files appear only when their cluster is expanded.
// ---------------------------------------------------------------------------

interface VisibleFolder {
  kind: "folder";
  id: string; // cluster path
  cluster: ClusterNode;
  expanded: boolean;
  childCount: number; // direct childFiles.length (kept for parity)
  totalDescendantFiles: number;
}

interface VisibleFile {
  kind: "file";
  id: string; // file id
  file: FileNode;
}

type VisibleEntry = VisibleFolder | VisibleFile;

interface VisibleTree {
  /** Flat — every folder + file in the visible set, in stable order. */
  entries: VisibleEntry[];
  /**
   * Hierarchy edges between visible entries, in (source, target) form. Both
   * endpoints are guaranteed to be in `entries`. Sorted for determinism.
   */
  hierarchyPairs: Array<{ source: string; target: string }>;
  /** Top-level folders (parent === null). Drives per-root packing. */
  topLevelFolderIds: string[];
}

function buildVisibleFlat(graph: Graph, expanded: Set<string>): VisibleTree {
  const clusters = graph.clusters ?? [];
  const clustersByPath = new Map<string, ClusterNode>();
  for (const c of clusters) clustersByPath.set(c.path, c);

  const filesById = new Map<string, FileNode>();
  for (const f of graph.files) filesById.set(f.id, f);

  const descendantCountByPath = buildDescendantFileCounts(clusters, clustersByPath);

  const entries: VisibleEntry[] = [];
  const hierarchyPairs: Array<{ source: string; target: string }> = [];
  const topLevelFolderIds: string[] = [];

  // Walk top-down. A folder is always visible (so the user can expand it);
  // its children (sub-folders, files) become visible only when it's expanded.
  // This matches `tree-layout.ts`'s `buildVisibleTree` behavior so the two
  // layouts produce the same `visibleIds` set for the same `expanded` input.
  const walk = (cluster: ClusterNode): void => {
    entries.push({
      kind: "folder",
      id: cluster.path,
      cluster,
      expanded: expanded.has(cluster.path),
      childCount: (cluster.childFiles ?? []).length,
      totalDescendantFiles: descendantCountByPath.get(cluster.path) ?? 0,
    });

    if (!expanded.has(cluster.path)) return;

    // Sub-clusters first (sorted for determinism), then files.
    const childClusterPaths = (cluster.childClusters ?? []).slice().sort();
    for (const subPath of childClusterPaths) {
      const sub = clustersByPath.get(subPath);
      if (!sub) continue;
      // Inject hierarchy edge BEFORE recursing so edges read parent-first
      // top-to-bottom, which matches mrtree's left-to-right rank flow.
      hierarchyPairs.push({ source: cluster.path, target: sub.path });
      walk(sub);
    }

    const childFileIds = (cluster.childFiles ?? []).slice().sort();
    for (const fid of childFileIds) {
      const f = filesById.get(fid);
      if (!f) continue;
      entries.push({
        kind: "file",
        id: f.id,
        file: f,
      });
      hierarchyPairs.push({ source: cluster.path, target: f.id });
    }
  };

  const topLevelClusters = clusters
    .filter((c) => c.parent === null)
    .slice()
    .sort((a, b) => a.path.localeCompare(b.path));

  for (const top of topLevelClusters) {
    topLevelFolderIds.push(top.path);
    walk(top);
  }

  return { entries, hierarchyPairs, topLevelFolderIds };
}

// ---------------------------------------------------------------------------
// ELK marshal — every visible entry becomes a leaf node in a single-root
// ElkNode tree. Hierarchy edges are passed as graph edges so mrtree uses
// them to compute ranks. Cross-reference edges are NOT passed (mrtree
// ignores non-tree edges, and we want them retargeted post-layout anyway).
// ---------------------------------------------------------------------------

function entryDimensions(entry: VisibleEntry): { width: number; height: number } {
  if (entry.kind === "folder") {
    return { width: TREE_FOLDER_W, height: TREE_FOLDER_H };
  }
  return { width: TREE_FILE_W, height: TREE_FILE_H };
}

interface RootSlice {
  /** The top-level folder id this slice is rooted at. */
  rootId: string;
  /** Entries (folder + descendants) belonging to this root. */
  entries: VisibleEntry[];
  /** Hierarchy edges entirely within this root's subtree. */
  pairs: Array<{ source: string; target: string }>;
}

/**
 * Slice the full visible tree into one chunk per top-level folder. Each
 * chunk gets its own ELK call with mrtree (parity with tree-layout.ts's
 * per-root strategy: keeps single-root layouts deterministic and lets the
 * row-packer place roots LTR-then-wrap). Entries that don't belong to any
 * top-level root (e.g. orphan files without a cluster — defensive only)
 * are dropped from layout — they wouldn't have a mrtree position anyway.
 */
function sliceByRoot(tree: VisibleTree): RootSlice[] {
  // Build a parent-id map so we can walk up from every entry to its top.
  const parentOf = new Map<string, string>();
  for (const p of tree.hierarchyPairs) {
    parentOf.set(p.target, p.source);
  }

  const rootOf = (id: string): string | null => {
    let cur = id;
    let safety = 128;
    while (parentOf.has(cur) && safety > 0) {
      cur = parentOf.get(cur)!;
      safety -= 1;
    }
    return tree.topLevelFolderIds.includes(cur) ? cur : null;
  };

  const buckets = new Map<string, RootSlice>();
  for (const id of tree.topLevelFolderIds) {
    buckets.set(id, { rootId: id, entries: [], pairs: [] });
  }

  for (const entry of tree.entries) {
    const root = rootOf(entry.id);
    if (!root) continue;
    buckets.get(root)?.entries.push(entry);
  }
  for (const pair of tree.hierarchyPairs) {
    const root = rootOf(pair.source);
    if (!root) continue;
    buckets.get(root)?.pairs.push(pair);
  }

  // Stable order: top-level path order (already sorted in buildVisibleFlat).
  return tree.topLevelFolderIds
    .map((id) => buckets.get(id)!)
    .filter((b) => b.entries.length > 0);
}

function toElkRoot(slice: RootSlice): ElkNode {
  // Single ELK root with every entry as a direct leaf child — flat layout.
  // mrtree uses the `edges` field to compute ranks.
  return {
    id: `dendro-root::${slice.rootId}`,
    children: slice.entries.map((entry) => {
      const { width, height } = entryDimensions(entry);
      return {
        id: entry.id,
        width,
        height,
      };
    }),
    edges: slice.pairs.map((p, i) => ({
      id: `dendro-edge-${i}::${p.source}->${p.target}`,
      sources: [p.source],
      targets: [p.target],
    })),
  };
}

// ---------------------------------------------------------------------------
// Top-level row packing for the multi-root case. mrtree would otherwise
// stack roots vertically; we want the same LTR-then-wrap flow tree-layout.ts
// uses so multi-root graphs read consistently across the two flat layouts.
// Constants COPIED from tree-layout.ts (Q2: copy with TODO; if a third
// consumer arrives, extract to a shared util).
// ---------------------------------------------------------------------------

const TOP_LEVEL_GAP_X = 80;
const TOP_LEVEL_GAP_Y = 80;
const TOP_LEVEL_PER_ROW = 5;

function packRoots(roots: ElkNode[]): void {
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
    const w = r.width ?? TREE_FOLDER_W;
    const h = r.height ?? TREE_FOLDER_H;
    colX += w + TOP_LEVEL_GAP_X;
    rowHeight = Math.max(rowHeight, h);
    colIdx += 1;
  }
}

// ---------------------------------------------------------------------------
// Cache key — stable hash of (cluster set, file set, expanded set). Same
// shape as tree-layout's `cacheKeyFor` but PREFIXED `dendrogram/` at the
// call site so the LRU bucket doesn't collide with tree mode's keys.
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

export async function computeDendrogramLayout(
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

  const visible = buildVisibleFlat(graph, expanded);
  if (visible.entries.length === 0) {
    return { nodes: [], edges: [] };
  }

  const slices = sliceByRoot(visible);
  const cacheKey = cacheKeyFor(graph, expanded);

  // Per-root mrtree (same strategy as tree-layout). Each ELK call yields a
  // root with absolute child positions inside it; the ROOT's width/height
  // is computed by ELK once children are laid out.
  const elkRoots: ElkNode[] = [];
  const sliceByRootId = new Map<string, RootSlice>();
  for (let i = 0; i < slices.length; i++) {
    const slice = slices[i];
    sliceByRootId.set(slice.rootId, slice);
    const elkInput = toElkRoot(slice);
    const laid = await computeElkLayout(elkInput, {
      algorithm: "mrtree",
      cacheKey: `dendrogram/${cacheKey}/root-${i}`,
    });
    elkRoots.push(laid);
  }

  // Pack roots LTR-then-wrap (overrides the per-root x/y the elk root has
  // implicitly at 0,0; child positions inside the root remain relative to
  // the root).
  packRoots(elkRoots);

  // Flatten children to top-level LaidOutGraphNodes (parent === null,
  // absolute positions = root.position + child.position). NO parentNode in
  // the output — every node is a sibling at React Flow's top level. This is
  // what makes the layout read as a dendrogram instead of nested boxes.
  const nodes: LaidOutGraphNode[] = [];
  for (const elkRoot of elkRoots) {
    const slice = sliceByRootId.get(stripRootPrefix(elkRoot.id));
    if (!slice) continue;
    const rootX = elkRoot.x ?? 0;
    const rootY = elkRoot.y ?? 0;

    // Build a quick id → entry map so we can attach data when emitting.
    const entryById = new Map<string, VisibleEntry>();
    for (const e of slice.entries) entryById.set(e.id, e);

    for (const child of elkRoot.children ?? []) {
      const entry = entryById.get(child.id);
      if (!entry) continue;
      const x = rootX + (child.x ?? 0);
      const y = rootY + (child.y ?? 0);
      const width = child.width ?? entryDimensions(entry).width;
      const height = child.height ?? entryDimensions(entry).height;
      if (entry.kind === "folder") {
        nodes.push({
          id: entry.id,
          kind: "treeFolder",
          x,
          y,
          width,
          height,
          parent: null,
          cluster: entry.cluster,
          expanded: entry.expanded,
          childCount: entry.childCount,
          totalDescendantFiles: entry.totalDescendantFiles,
        });
      } else {
        nodes.push({
          id: entry.id,
          kind: "treeFile",
          x,
          y,
          width,
          height,
          parent: null,
          file: entry.file,
        });
      }
    }
  }

  // Hierarchy edges (synthetic, slate via treeEdgeStyleFor("d-aggregate")).
  // Stable ids so React Flow re-reconciles cleanly across re-layouts.
  const visibleIds = new Set(nodes.map((n) => n.id));
  const hierarchyEdges: LaidOutGraphEdge[] = visible.hierarchyPairs
    .filter((p) => visibleIds.has(p.source) && visibleIds.has(p.target))
    .map((p) => ({
      id: `hier:${p.source}->${p.target}`,
      source: p.source,
      target: p.target,
      kind: "d-aggregate" as const,
      unresolved: null,
      count: 1,
      kindBreakdown: { "d-aggregate": 1 } as Record<Edge["kind"], number>,
    }));

  // Cross-reference edges (include / ref / import / xsd / logical-id).
  // `retargetEdges` walks each edge's endpoints up the cluster chain to the
  // nearest visible ancestor, so when a deep file is hidden inside a
  // collapsed folder the edge re-anchors to the folder card.
  const { edges: crossRefEdges, intraClusterEdgeCounts } = retargetEdges(
    graph.edges,
    {
      visibleIds,
      fileToClusterChain,
    },
  );

  // Attach per-folder intra-edge counts so TreeFolderNode can render the
  // collapsed-folder `↻ N` badge (visual-review 2026-04-23 — same
  // affordance as ClusterNode in cluster mode). Only meaningful for
  // collapsed `treeFolder` cards; expanded folders aren't rendered in
  // dendrogram mode (the layout is flat) so an expanded card never owns
  // a self-loop count.
  for (const node of nodes) {
    if (node.kind !== "treeFolder") continue;
    const count = intraClusterEdgeCounts.get(node.id);
    if (count !== undefined && count > 0) {
      node.intraClusterEdgeCount = count;
    }
  }

  // Hierarchy first (paints below) → cross-refs second (paints above so
  // cyan stays visible against slate). React Flow renders in array order.
  return {
    nodes,
    edges: [...hierarchyEdges, ...crossRefEdges],
  };
}

function stripRootPrefix(elkRootId: string): string {
  const prefix = "dendro-root::";
  return elkRootId.startsWith(prefix) ? elkRootId.slice(prefix.length) : elkRootId;
}
