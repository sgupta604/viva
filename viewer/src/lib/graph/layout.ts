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

const NODE_W = 180;
const NODE_H = 64;

/**
 * Compute a deterministic, folder-aware dagre layout. Called on the filtered
 * graph; memoize at the caller. Two calls with the same input produce identical
 * coordinates.
 */
export function computeLayout(graph: Graph): LaidOutGraph {
  const g = new dagre.graphlib.Graph({ compound: true });
  g.setGraph({ rankdir: "LR", nodesep: 30, ranksep: 80, marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));

  const folders = Array.from(new Set(graph.files.map((f) => f.folder || ".")))
    .filter(Boolean)
    .sort();
  for (const folder of folders) {
    g.setNode(`folder::${folder}`, { label: folder });
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
