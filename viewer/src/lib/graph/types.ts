// Mirrors docs/GRAPH-SCHEMA.md. Both sides of the contract read from there.

export type FileKind = "xml" | "yaml" | "json" | "ini";
export type ParamKind = "scalar" | "list" | "map";
export type EdgeKind = "include" | "ref" | "import";

export interface ParamNode {
  key: string;
  value: string;
  kind: ParamKind;
  line: number | null;
}

export interface FileNode {
  id: string;
  path: string;
  name: string;
  folder: string;
  kind: FileKind;
  sizeBytes: number;
  params: ParamNode[];
  parseError: string | null;
  isTest: boolean;
}

export interface Edge {
  source: string;
  target: string | null;
  kind: EdgeKind;
  unresolved: string | null;
}

export interface Graph {
  version: 1;
  root: string;
  generatedAt?: string;
  files: FileNode[];
  edges: Edge[];
}
