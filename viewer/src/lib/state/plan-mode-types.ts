/**
 * Plan Mode — TypeScript shapes (Phase 1).
 *
 * Pure type-only module. No runtime code. Re-uses the existing Graph contract
 * so layout engines stay ignorant of plan mode.
 *
 * Locked decisions (per .claude/features/plan-mode/plan.md §1):
 *  - Synthetic IDs use the `plan:` namespace prefix; live IDs are the
 *    crawler's 10-hex SHA-1 prefixes — collision-free by construction.
 *  - Tombstones store live IDs (nodes) and composite keys (edges); the
 *    composer keeps the live record present and surfaces a flag set so
 *    layout engines never see a removed node.
 *  - Notes are out-of-band (not embedded in `Graph`); the composer returns
 *    a `noteByTargetId` map for lookup.
 *  - `Plan.baseGraph` is a STRIPPED snapshot (`params` dropped) so plans
 *    persist within localStorage quota even on the xxlarge fixture.
 */
import type { EdgeKind, FileKind, Graph } from "@/lib/graph/types";

/**
 * A node added by a plan that does not exist in the live graph. Composer maps
 * this onto the live `FileNode` shape (`params: []`, `parseError: null`,
 * `isTest: false`, `sizeBytes: 0`, `generated: false`, `generatedFrom: null`)
 * so layout engines can consume it unchanged.
 */
export interface PlannedNode {
  /** `plan:node:<uuid-v4>` — collision-free against live 10-hex SHA-1 ids. */
  id: string;
  name: string;
  folder: string;
  kind: FileKind;
}

/**
 * An edge added by a plan. Endpoints may reference live ids OR `plan:node:*`
 * ids; the composer simply appends to the edge array.
 */
export interface PlannedEdge {
  /** `plan:edge:<uuid-v4>`. */
  id: string;
  source: string;
  target: string;
  kind: EdgeKind;
}

/**
 * A free-text annotation pinned to a node or edge.
 *
 * For node targets, `targetId` is the node id (live or plan:node:*).
 * For edge targets, `targetId` is the composite edge key
 * (`source|kind|target` — see `edgeKey()` in `plan-ids.ts`).
 */
export interface PlanNote {
  /** `plan:note:<uuid-v4>`. */
  id: string;
  targetId: string;
  targetKind: "node" | "edge";
  text: string;
  /** ISO-8601. */
  createdAt: string;
  /** ISO-8601. */
  updatedAt: string;
}

/**
 * The mutable edit-buffer for an active plan. Composer reads this and produces
 * a derived `Graph` plus side-channel sets/maps for tombstones and notes.
 */
export interface PlanEdits {
  addedNodes: PlannedNode[];
  addedEdges: PlannedEdge[];
  /** Tombstoned live node ids. The live FileNode is still present in the
   *  composed graph; rendering decides how to mark it. (Phase 2 visual.) */
  removedNodeIds: string[];
  /** Tombstoned live edge composite keys (`source|kind|target`). */
  removedEdgeKeys: string[];
  notes: PlanNote[];
  /** Display-name overrides keyed by node id (live OR plan:node:*). */
  renamedNodes: Record<string, string>;
}

/**
 * A persisted plan. `baseGraph` is the live graph snapshot taken at
 * `createPlan` time, with `params` stripped (Q6 locked). Phase 3 uses it for
 * drift detection; Phase 1 just stores it.
 */
export interface Plan {
  /** `plan:<uuid-v4>`. */
  id: string;
  name: string;
  /** ISO-8601. */
  createdAt: string;
  /** ISO-8601. */
  updatedAt: string;
  archived: boolean;
  baseGraph: Graph;
  edits: PlanEdits;
}

/** Phase 3 surface — included now so the composer's return type can reference
 *  it without a Phase-3 import. The composer itself does NOT compute diffs in
 *  Phase 1 (returns empty arrays); Phase 3 lands `diffGraphs()`. */
export interface GraphDiff {
  addedNodes: string[];
  removedNodes: string[];
  addedEdges: string[];
  removedEdges: string[];
  changedNodes: string[];
}

/**
 * Output of `composePlanGraph(live, plan, enabled)`.
 *
 * **Identity-passthrough invariant (Phase 1):** when `enabled === false`,
 * `plan === null`, OR `plan.edits` has zero entries, `out.graph === live`
 * (REFERENCE EQUALITY — not a copy). This is what makes the Phase 1
 * GraphCanvas wire-up truly invisible.
 */
export interface ComposedPlanGraph {
  /** Valid v2 Graph; layout engines consume unchanged. */
  graph: Graph;
  tombstonedNodeIds: ReadonlySet<string>;
  tombstonedEdgeKeys: ReadonlySet<string>;
  noteByTargetId: ReadonlyMap<string, PlanNote>;
}
