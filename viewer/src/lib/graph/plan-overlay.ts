/**
 * composePlanGraph — derive a renderable Graph by overlaying a plan onto live
 * (Phase 1).
 *
 * **Identity-passthrough invariant (the most important contract in Phase 1):**
 * when `enabled === false`, OR `plan === null`, OR `plan.edits` has zero
 * entries, `composePlanGraph(live, plan, enabled).graph` is REFERENCE-EQUAL
 * to `live` (NOT a copy — the same object reference). This is what keeps
 * `useMemo` deps stable and makes the GraphCanvas wire-up truly invisible.
 *
 * Output:
 *  - `graph`              — valid v2 Graph; layout engines consume unchanged.
 *  - `tombstonedNodeIds`  — flag set; tombstoned nodes are STILL present in
 *                           `graph.files` (rendering decides how to mark them
 *                           in Phase 2). Layout engines stay ignorant.
 *  - `tombstonedEdgeKeys` — same shape for edges.
 *  - `noteByTargetId`     — out-of-band map; notes are NOT embedded in Graph.
 *
 * Pure: never mutates `live` or `plan`.
 */
import type { ClusterNode, FileNode, Graph } from "./types";
import type {
  ComposedPlanGraph,
  Plan,
  PlannedEdge,
  PlannedNode,
} from "@/lib/state/plan-mode-types";

const EMPTY_NODE_SET: ReadonlySet<string> = new Set();
const EMPTY_EDGE_SET: ReadonlySet<string> = new Set();
const EMPTY_NOTE_MAP: ReadonlyMap<string, never> = new Map();

function isPlanEffectivelyEmpty(plan: Plan): boolean {
  const e = plan.edits;
  return (
    e.addedNodes.length === 0 &&
    e.addedEdges.length === 0 &&
    e.removedNodeIds.length === 0 &&
    e.removedEdgeKeys.length === 0 &&
    e.notes.length === 0 &&
    Object.keys(e.renamedNodes).length === 0
  );
}

function plannedNodeToFileNode(p: PlannedNode): FileNode {
  // Build the synthetic FileNode using the existing v2 schema. `params: []`
  // and `parseError: null` keep the layout pipelines happy. `path` is
  // derived from folder + name so search/sort components don't choke.
  const path = p.folder ? `${p.folder}/${p.name}` : p.name;
  return {
    id: p.id,
    path,
    name: p.name,
    folder: p.folder,
    kind: p.kind,
    sizeBytes: 0,
    params: [],
    parseError: null,
    isTest: false,
    generated: false,
    generatedFrom: null,
  };
}

export function composePlanGraph(
  live: Graph | null,
  plan: Plan | null,
  enabled: boolean,
): ComposedPlanGraph | null {
  if (!live) return null;

  // Identity passthrough — the cheapest correctness guarantee for "headless
  // toggle changes nothing visible." Returning the SAME `live` reference
  // keeps every downstream `useMemo` dep stable.
  if (!enabled || !plan || isPlanEffectivelyEmpty(plan)) {
    return {
      graph: live,
      tombstonedNodeIds: EMPTY_NODE_SET,
      tombstonedEdgeKeys: EMPTY_EDGE_SET,
      noteByTargetId: EMPTY_NOTE_MAP as ReadonlyMap<string, never>,
    };
  }

  // Sort additions by id so two calls with the same input produce the same
  // output ordering — important for any future snapshot-based test stability.
  const addedNodes = [...plan.edits.addedNodes].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
  const addedEdges = [...plan.edits.addedEdges].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );

  const newFiles: FileNode[] = addedNodes.map(plannedNodeToFileNode);

  // Append synthetic edges to the live edges list. We do NOT remove tombstoned
  // edges — Phase 2 renders them with a flag, layout engines see them all.
  const composedFiles: FileNode[] =
    newFiles.length === 0 ? live.files : [...live.files, ...newFiles];

  const composedEdges =
    addedEdges.length === 0
      ? live.edges
      : [
          ...live.edges,
          ...addedEdges.map((e: PlannedEdge) => ({
            source: e.source,
            target: e.target,
            kind: e.kind,
            unresolved: null,
          })),
        ];

  // Cluster childFiles needs to grow when a synthetic node lands in an
  // existing cluster — otherwise the cluster-layout walker will skip it.
  let composedClusters: ClusterNode[] | undefined = live.clusters;
  if (newFiles.length > 0 && live.clusters && live.clusters.length > 0) {
    // Group additions by folder for O(n+m) merging.
    const addsByFolder = new Map<string, string[]>();
    for (const n of newFiles) {
      const arr = addsByFolder.get(n.folder) ?? [];
      arr.push(n.id);
      addsByFolder.set(n.folder, arr);
    }
    composedClusters = live.clusters.map((c) => {
      const adds = addsByFolder.get(c.path);
      if (!adds || adds.length === 0) return c;
      return { ...c, childFiles: [...c.childFiles, ...adds] };
    });
  }

  const tombstonedNodeIds = new Set(plan.edits.removedNodeIds);
  const tombstonedEdgeKeys = new Set(plan.edits.removedEdgeKeys);
  const noteByTargetId = new Map<string, (typeof plan.edits.notes)[number]>();
  for (const note of plan.edits.notes) {
    noteByTargetId.set(note.targetId, note);
  }

  const composed: Graph = {
    version: live.version,
    root: live.root,
    generatedAt: live.generatedAt,
    files: composedFiles,
    edges: composedEdges,
    clusters: composedClusters,
  };

  return {
    graph: composed,
    tombstonedNodeIds,
    tombstonedEdgeKeys,
    noteByTargetId,
  };
}
