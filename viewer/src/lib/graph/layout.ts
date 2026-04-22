import dagre from "dagre";
import type { Graph, FileNode, Edge } from "./types";

export interface LaidOutNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  file: FileNode;
  folder: string;
}

export interface LaidOutEdge extends Edge {
  id: string;
}

export interface LaidOutGraph {
  nodes: LaidOutNode[];
  edges: LaidOutEdge[];
  folders: string[];
}

// Fixed node dimensions reserved by dagre. FileNode pins its rendered
// width to NODE_W via an import in FileNode.tsx so the DOM card never
// exceeds the reserved layout slot (long paths previously stretched the
// card past NODE_W and overlapped neighbors).
export const NODE_W = 224;
export const NODE_H = 76;

// ---------------------------------------------------------------------------
// v2 cluster-layout dimensions (large-codebase-viewer)
// Single source of truth for ClusterNode.tsx and cluster-layout.ts. Consumers
// MUST import these rather than hard-code — lesson from xml-viewer-hardening
// 26f948f (FileNode width drift against dagre layout slot).
// ---------------------------------------------------------------------------
/** Header strip of an expanded cluster: title + toggle + child-count badge. */
export const CLUSTER_HEADER_HEIGHT = 32;
/** Inner padding inside an expanded cluster before first child tile. */
export const CLUSTER_PADDING = 16;
/** Width of a collapsed cluster tile (shown at overview zoom). */
export const COLLAPSED_CLUSTER_W = 220;
/** Height of a collapsed cluster tile. */
export const COLLAPSED_CLUSTER_H = 64;

// ---------------------------------------------------------------------------
// v3 tree (dendrogram) layout dimensions — small text-label cards so the
// dendrogram has even ranks and the whole hierarchy reads as a tree (matches
// the user's "Research Graph Datasets" reference image). Folders + files are
// roughly the same size in tree mode, distinguished by fill/border styling
// rather than dimensions.
// ---------------------------------------------------------------------------
/** Width reserved for a tree-mode folder card. */
export const TREE_FOLDER_W = 168;
/** Height reserved for a tree-mode folder card. */
export const TREE_FOLDER_H = 36;
/** Width reserved for a tree-mode file card (matches folder for even ranks). */
export const TREE_FILE_W = 180;
/** Height reserved for a tree-mode file card. */
export const TREE_FILE_H = 36;

/**
 * Compute a deterministic, folder-aware dagre layout. Called on the filtered
 * graph; memoize at the caller. Two calls with the same input produce identical
 * coordinates.
 */
export function computeLayout(graph: Graph): LaidOutGraph {
  const g = new dagre.graphlib.Graph({ compound: true });
  // Compound mode underestimates parent-group sizing, so we use generous
  // node/rank separation and explicit per-folder padding to keep child
  // nodes from visually overlapping siblings or neighboring folders.
  g.setGraph({ rankdir: "LR", nodesep: 50, ranksep: 120, marginx: 40, marginy: 40 });
  g.setDefaultEdgeLabel(() => ({}));

  const folders = Array.from(new Set(graph.files.map((f) => f.folder || ".")))
    .filter(Boolean)
    .sort();
  for (const folder of folders) {
    // dagre supports `paddingX`/`paddingY` on compound parents; without these,
    // the parent rect is too small and child nodes spill across the border.
    g.setNode(`folder::${folder}`, { label: folder, paddingX: 24, paddingY: 16 });
  }

  const fileById = new Map<string, FileNode>();
  for (const f of graph.files) {
    fileById.set(f.id, f);
    g.setNode(f.id, { width: NODE_W, height: NODE_H });
    const folderKey = `folder::${f.folder || "."}`;
    g.setParent(f.id, folderKey);
  }

  for (const e of graph.edges) {
    if (e.target && fileById.has(e.source) && fileById.has(e.target)) {
      g.setEdge(e.source, e.target);
    }
  }

  dagre.layout(g);

  const nodes: LaidOutNode[] = [];
  for (const f of graph.files) {
    const n = g.node(f.id);
    if (!n) continue;
    nodes.push({
      id: f.id,
      x: n.x - NODE_W / 2,
      y: n.y - NODE_H / 2,
      width: NODE_W,
      height: NODE_H,
      file: f,
      folder: f.folder || ".",
    });
  }
  nodes.sort((a, b) => a.id.localeCompare(b.id));

  const edges: LaidOutEdge[] = graph.edges.map((e, i) => ({
    ...e,
    id: `${e.source}->${e.target ?? "unresolved"}-${e.kind}-${i}`,
  }));

  return { nodes, edges, folders };
}
