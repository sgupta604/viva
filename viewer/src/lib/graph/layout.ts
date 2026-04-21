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

const NODE_W = 224;
const NODE_H = 76;

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
