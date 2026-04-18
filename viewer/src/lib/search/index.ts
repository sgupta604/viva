import Fuse from "fuse.js";
import type { Graph, FileNode } from "@/lib/graph/types";

export interface SearchDoc {
  id: string;
  path: string;
  name: string;
  paramKeys: string;
  file: FileNode;
}

export function buildIndex(graph: Graph): Fuse<SearchDoc> {
  const docs: SearchDoc[] = graph.files.map((f) => ({
    id: f.id,
    path: f.path,
    name: f.name,
    paramKeys: f.params.map((p) => p.key).join(" "),
    file: f,
  }));
  return new Fuse(docs, {
    includeScore: true,
    keys: [
      { name: "name", weight: 0.4 },
      { name: "path", weight: 0.3 },
      { name: "paramKeys", weight: 0.3 },
    ],
    threshold: 0.4,
  });
}
