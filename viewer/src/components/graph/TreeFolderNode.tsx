/**
 * TreeFolderNode — flat text-label card for tree (dendrogram) mode.
 *
 * UNLIKE `ClusterNode`, this is NOT a containment box. The dendrogram
 * expresses parent→child via DRAWN orthogonal hierarchy edges between
 * sibling cards (see `tree-layout.ts:hierarchy edge injection`). The card
 * itself is just a small label with a chevron + count badge.
 *
 * Matches the user's reference image (image copy.png — "Research Graph
 * Datasets") where folders are gray rounded text labels.
 *
 * Interactions parity with ClusterNode:
 *   - Click toggles expanded via `hierarchyStore` (same single source of
 *     truth that cluster mode uses, so toggling between modes keeps
 *     expand state — FR9).
 *   - Enter / Space activates the toggle.
 *   - aria-expanded + aria-label so screen readers announce the state.
 *
 * Test compatibility:
 *   - `data-testid="cluster-${path}"` matches the ClusterNode selector so
 *     the existing E2E suite (which targets `[data-testid^="cluster-"]`)
 *     keeps working in tree mode without per-mode forks.
 *   - An additional `data-tree-folder="true"` attribute lets specs that
 *     need to disambiguate (e.g. assert tree mode is rendering flat cards,
 *     not containment boxes) target tree-mode folders specifically.
 */
import { memo, type KeyboardEvent } from "react";
import { Handle, Position } from "reactflow";
import { useHierarchyStore } from "@/lib/state/hierarchy-store";
import { useSelectionStore } from "@/lib/state/selection-store";
import type { ClusterNode as ClusterNodeData } from "@/lib/graph/types";
import { TREE_FOLDER_W, TREE_FOLDER_H } from "@/lib/graph/layout";

interface TreeFolderNodeProps {
  data: {
    cluster: ClusterNodeData;
    expanded: boolean;
    /**
     * Total descendant file count (matches ClusterNode.data.childCount —
     * the badge value is "everything in this subtree", not direct only).
     */
    childCount: number;
    /**
     * True when THIS folder card lives in the subtree of the currently-
     * focused folder cluster (and is not the focused folder itself). Drives
     * the "subtree highlight" ring — a subtler version of the direct hover
     * ring — so the user can see at a glance which sub-folders belong to
     * the parent they're hovering. Set by GraphCanvas; the helper that
     * computes subtree membership is `getDescendantIds`.
     */
    descendantOfFocus?: boolean;
  };
}

function TreeFolderNodeInner({ data }: TreeFolderNodeProps) {
  const { cluster, expanded, childCount, descendantOfFocus } = data;
  const expand = useHierarchyStore((s) => s.expand);
  const collapse = useHierarchyStore((s) => s.collapse);
  const hoveredNodeId = useSelectionStore((s) => s.hoveredNodeId);

  const isDAggregate = cluster.kind === "d-aggregate";
  const displayLabel = cluster.path.split("/").pop() || cluster.path;

  const onToggle = () => {
    if (expanded) collapse(cluster.path);
    else expand(cluster.path);
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onToggle();
    }
  };

  // Match the reference image's gray folder fill. Slightly different border
  // for d-aggregate so the synthetic .d/ aggregation reads as distinct.
  const borderStyle = isDAggregate ? "border-dashed" : "border-solid";

  // Hover affordance (Change 4, user feedback 2026-04-22): brighten the
  // border in the cross-ref accent color when the user hovers the folder
  // so they get a visual confirmation that THIS hover is what's lighting
  // up the connected cross-ref edges. Subtle (1px ring at 60% alpha) so it
  // doesn't compete with the existing hover:bg-neutral-700 background
  // shift or get loud against the dim default state of unfocused edges.
  const isHovered = hoveredNodeId === cluster.path;
  // Subtree-membership ring (user feedback 2026-04-22, "hover folder →
  // light up subtree"): when this folder is a descendant of the focused
  // folder, paint a softer 40%-alpha ring so it reads as "in the subtree"
  // without competing with the direct hover ring (60%-alpha) on the
  // focused folder itself. Direct hover wins if both apply (defensive — by
  // construction GraphCanvas suppresses descendantOfFocus on the focused
  // folder, so the && order is preference, not arbitration).
  const hoverRing = isHovered
    ? "ring-1 ring-sky-300/60"
    : descendantOfFocus
      ? "ring-1 ring-sky-300/40"
      : "";

  return (
    <div
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      aria-label={`folder ${cluster.path} (${childCount} files) — press to ${expanded ? "collapse" : "expand"}`}
      data-testid={`cluster-${cluster.path}`}
      data-cluster-kind={cluster.kind}
      data-cluster-path={cluster.path}
      data-cluster-parent={cluster.parent ?? ""}
      data-tree-folder="true"
      data-expanded={expanded ? "true" : "false"}
      data-descendant-of-focus={descendantOfFocus ? "true" : "false"}
      onClick={onToggle}
      onKeyDown={onKey}
      style={{ width: TREE_FOLDER_W, height: TREE_FOLDER_H }}
      className={`flex cursor-pointer items-center gap-2 rounded-md border ${borderStyle} border-neutral-600 bg-neutral-800 px-2.5 py-1 text-left shadow-sm transition hover:bg-neutral-700 ${hoverRing}`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-1.5 !w-1.5 !bg-neutral-500"
        isConnectable={false}
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!h-1.5 !w-1.5 !bg-neutral-500"
        isConnectable={false}
      />
      <span aria-hidden="true" className="text-[10px] text-neutral-400">
        {expanded ? "▾" : "▸"}
      </span>
      <div
        className="min-w-0 flex-1 truncate font-mono text-xs text-neutral-100"
        title={cluster.path}
      >
        {displayLabel}
      </div>
      {childCount > 0 ? (
        <span className="shrink-0 rounded bg-neutral-900 px-1.5 py-0.5 text-[9px] font-medium text-neutral-300">
          {childCount}
        </span>
      ) : null}
    </div>
  );
}

export default memo(TreeFolderNodeInner);
