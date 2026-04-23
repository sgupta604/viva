/**
 * ClusterNode — compound node rendered by React Flow to represent a folder
 * (kind="folder") or `.d/` drop-in aggregate (kind="d-aggregate") in the
 * cluster-aware graph.
 *
 * Rendering:
 *   - Collapsed: full tile (COLLAPSED_CLUSTER_W × COLLAPSED_CLUSTER_H) with
 *     cluster path, child-count badge, and a chevron "▸". Click toggles open.
 *   - Expanded: header strip (CLUSTER_HEADER_HEIGHT) with chevron "▾" + label
 *     + badge; child file nodes render inside the parent area (parentNode
 *     relationship wired from cluster-layout.ts).
 *
 * Accessibility:
 *   - role="button" + tabIndex=0 on the header
 *   - aria-label + aria-expanded so screen readers announce the state
 *   - Enter / Space key activates the toggle
 *
 * Interactions:
 *   - The toggle mutates hierarchyStore.expand/collapse. The store triggers a
 *     re-render downstream because GraphCanvas reads expandedSet() for each
 *     layout pass.
 *
 * .d/ variant styling:
 *   - Narrower tile + gray dashed border to signal "synthetic runtime
 *     aggregation, not author-visible folder" per research Q13.
 */
import { memo, type KeyboardEvent } from "react";
import { Handle, Position } from "reactflow";
import { useHierarchyStore } from "@/lib/state/hierarchy-store";
import type { ClusterNode as ClusterNodeData } from "@/lib/graph/types";
import { CLUSTER_HEADER_HEIGHT } from "@/lib/graph/layout";

interface ClusterNodeProps {
  data: {
    cluster: ClusterNodeData;
    expanded: boolean;
    childCount: number;
  };
}

function ClusterNodeInner({ data }: ClusterNodeProps) {
  const { cluster, expanded, childCount } = data;
  const expand = useHierarchyStore((s) => s.expand);
  const collapse = useHierarchyStore((s) => s.collapse);

  const isDAggregate = cluster.kind === "d-aggregate";
  const displayLabel =
    cluster.path.split("/").pop() || cluster.path;

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

  const borderStyle = isDAggregate ? "border-dashed" : "border-solid";
  const borderColor = expanded ? "border-neutral-500" : "border-neutral-700";

  if (!expanded) {
    return (
      <div
        role="button"
        tabIndex={0}
        aria-expanded={false}
        aria-label={`cluster ${cluster.path} (${childCount} files) — press to expand`}
        data-testid={`cluster-${cluster.path}`}
        data-cluster-kind={cluster.kind}
        data-cluster-path={cluster.path}
        data-cluster-parent={cluster.parent ?? ""}
        onClick={onToggle}
        onKeyDown={onKey}
        // Background changed from `bg-neutral-900/70` (70% alpha) to opaque
        // `bg-neutral-900` (user QA 2026-04-22). Translucent fill let
        // hover-lit cross-ref edges bleed through the cluster card and
        // visibly cut across the folder name + count badge in tree mode —
        // the same image #14 root cause that was fixed for TreeFileNode but
        // not for ClusterNode. Cluster cards already paint above the edge
        // layer via React Flow's node z-index, so an opaque fill safely
        // hides any edge passing behind them. No interaction change.
        className={`h-full w-full cursor-pointer rounded-lg border-2 ${borderStyle} ${borderColor} bg-neutral-900 px-3 py-2 text-left transition hover:bg-neutral-800`}
      >
        <Handle
          type="target"
          position={Position.Left}
          className="!bg-neutral-500"
          isConnectable={false}
        />
        <Handle
          type="source"
          position={Position.Right}
          className="!bg-neutral-500"
          isConnectable={false}
        />
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="text-neutral-400">
            ▸
          </span>
          <div
            className="flex-1 truncate font-mono text-sm text-neutral-100"
            title={cluster.path}
          >
            {displayLabel}
          </div>
          <span className="shrink-0 rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] font-medium text-neutral-300">
            {childCount}
          </span>
        </div>
        <div
          className="mt-1 truncate font-mono text-[10px] text-neutral-500"
          title={cluster.path}
        >
          {isDAggregate ? ".d/ aggregate" : "folder"}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`h-full w-full rounded-lg border ${borderStyle} ${borderColor} bg-neutral-900/30`}
      data-testid={`cluster-${cluster.path}`}
      data-cluster-kind={cluster.kind}
      data-cluster-path={cluster.path}
      data-cluster-parent={cluster.parent ?? ""}
      data-expanded="true"
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-neutral-500"
        isConnectable={false}
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!bg-neutral-500"
        isConnectable={false}
      />
      <div
        role="button"
        tabIndex={0}
        aria-expanded={true}
        aria-label={`cluster ${cluster.path} (${childCount} files) — press to collapse`}
        onClick={onToggle}
        onKeyDown={onKey}
        style={{ height: CLUSTER_HEADER_HEIGHT }}
        // Header is opaque (was `bg-neutral-900/70`) for the same image #14
        // reason as the collapsed branch above: cross-ref edges crossing the
        // header strip would bleed through the translucent fill and cut
        // through the folder name. Body keeps its translucent
        // `bg-neutral-900/30` because children render INSIDE it — that's a
        // legitimate soft-tint container, not a label-bearing surface.
        className="flex cursor-pointer items-center gap-2 border-b border-neutral-800 bg-neutral-900 px-3"
      >
        <span aria-hidden="true" className="text-neutral-400">
          ▾
        </span>
        <div
          className="flex-1 truncate font-mono text-sm text-neutral-100"
          title={cluster.path}
        >
          {displayLabel}
        </div>
        <span className="shrink-0 rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] font-medium text-neutral-300">
          {childCount}
        </span>
      </div>
    </div>
  );
}

export default memo(ClusterNodeInner);
