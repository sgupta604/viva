// Mirrors docs/GRAPH-SCHEMA.md. Both sides of the contract read from there.

export type FileKind = "xml" | "yaml" | "json" | "ini";
export type ParamKind = "scalar" | "list" | "map";
// v2: widened edge-kind union. `include|ref|import` from v1; `xsd|d-aggregate|logical-id` added in v2.
export type EdgeKind =
  | "include"
  | "ref"
  | "import"
  | "xsd"
  | "d-aggregate"
  | "logical-id";
// v2: cluster classification — `folder` for plain folders, `d-aggregate` for
// `.d/` drop-in directories paired with a sibling file of matching stem.
export type ClusterKind = "folder" | "d-aggregate";

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
  /**
   * v2 — true when the file was explicitly listed in a detected templating
   * manifest. Optional because:
   *  - unit-test literals from before v2 don't need to supply it; and
   *  - the runtime upgrade shim in schema.ts always fills the field with
   *    `false` for v1 inputs, so consumers can treat undefined as false.
   */
  generated?: boolean;
  /** v2 — POSIX path of the manifest that listed this file. `null` if not generated. */
  generatedFrom?: string | null;
}

/** Edge attributes — v2 extensible bag; currently only `.d/` load order. */
export interface EdgeAttrs {
  order?: number;
}

export interface Edge {
  source: string;
  target: string | null;
  kind: EdgeKind;
  /**
   * Null if target resolved. When non-null, may carry a classification prefix:
   * - `fallback:<href>` — xi:include target missing but xi:fallback declared.
   * - `ambiguous:<tail>` — multiple candidates, crawler refused to guess.
   * - otherwise — plain unresolved string.
   */
  unresolved: string | null;
  attrs?: EdgeAttrs;
}

/** v2 top-level cluster entry. Always present (possibly empty) in v2 graphs. */
export interface ClusterNode {
  path: string;
  parent: string | null;
  childFiles: string[];
  childClusters: string[];
  kind: ClusterKind;
}

export interface Graph {
  /** 1 (legacy-read via upgrade shim) or 2 (current crawler emission). */
  version: 1 | 2;
  root: string;
  generatedAt?: string;
  files: FileNode[];
  edges: Edge[];
  /**
   * Always present after parseGraph() (the v1 upgrade shim injects `[]`), but
   * marked optional so pre-v2 unit-test literals don't have to carry an empty
   * array. Consumers should read as `graph.clusters ?? []`.
   */
  clusters?: ClusterNode[];
}
