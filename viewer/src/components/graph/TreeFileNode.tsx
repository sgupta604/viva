/**
 * TreeFileNode — flat text-label card for tree (dendrogram) mode.
 *
 * Sibling to FileNode. The cluster-mode FileNode is a chunky card with kind
 * badge, folder path, and parse-error pill — too heavy for the dendrogram
 * which packs hundreds of leaves at small ranks. TreeFileNode strips it
 * down to filename + a single colored kind dot, matching the reference
 * image's light-blue leaf cards.
 *
 * Selection / interaction parity with FileNode:
 *   - Same `data-testid="node-${file.id}"` so existing E2E selectors work.
 *   - Click selection routed through the React Flow `onNodeClick` handler
 *     in GraphCanvas (we don't bind onClick directly — same pattern as
 *     FileNode).
 *   - Selected ring uses `selected` prop from React Flow.
 */
import { memo } from "react";
import { Handle, Position } from "reactflow";
import { useSelectionStore } from "@/lib/state/selection-store";
import { useGraphStore } from "@/lib/state/graph-store";
import { highlightsFor } from "@/lib/highlight/param-refs";
import { TREE_FILE_W, TREE_FILE_H } from "@/lib/graph/layout";
import type { FileNode as FileNodeData } from "@/lib/graph/types";

interface Props {
  data: { file: FileNodeData };
  selected: boolean;
}

const KIND_DOT: Record<string, string> = {
  xml: "bg-kind-xml",
  yaml: "bg-kind-yaml",
  json: "bg-kind-json",
  ini: "bg-kind-ini",
};

function TreeFileNodeInner({ data, selected }: Props) {
  const f = data.file;
  const selectedParamKey = useSelectionStore((s) => s.selectedParamKey);
  const graph = useGraphStore((s) => s.graph);

  let highlight: "strong" | "muted" | null = null;
  if (selectedParamKey && graph) {
    const h = highlightsFor(selectedParamKey, graph);
    if (h.edgeResolved.has(f.id)) highlight = "strong";
    else if (h.nameMatch.has(f.id)) highlight = "muted";
  }

  const ring =
    highlight === "strong"
      ? "ring-2 ring-amber-400"
      : highlight === "muted"
        ? "ring-1 ring-amber-400/40"
        : selected
          ? "ring-2 ring-blue-400"
          : "";

  // Light-blue fill for leaf files matches the reference image's leaf
  // styling. `generated` files dim slightly so the synthetic ones recede.
  const generatedClass = f.generated ? "opacity-70" : "";
  const parseFailClass = f.parseError ? "ring-1 ring-red-500/60" : "";

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`file ${f.path}`}
      data-testid={`node-${f.id}`}
      data-tree-file="true"
      data-generated={f.generated ? "true" : undefined}
      style={{ width: TREE_FILE_W, height: TREE_FILE_H }}
      className={`flex items-center gap-2 rounded-md border border-sky-700/50 bg-sky-950/60 px-2.5 py-1 text-left shadow-sm transition ${ring} ${generatedClass} ${parseFailClass}`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-1.5 !w-1.5 !bg-neutral-500"
        isConnectable={false}
      />
      <span
        aria-hidden="true"
        className={`h-2 w-2 shrink-0 rounded-full ${KIND_DOT[f.kind] ?? "bg-neutral-500"}`}
        title={f.kind}
      />
      <div
        className="min-w-0 flex-1 truncate font-mono text-xs text-neutral-100"
        title={f.path}
      >
        {f.name}
      </div>
      {f.generated ? (
        <span
          className="shrink-0 rounded bg-amber-900/40 px-1 text-[8px] font-medium uppercase text-amber-300"
          aria-label="generated"
          title={f.generatedFrom ? `generated from ${f.generatedFrom}` : "generated"}
        >
          gen
        </span>
      ) : null}
      <Handle
        type="source"
        position={Position.Right}
        className="!h-1.5 !w-1.5 !bg-neutral-500"
        isConnectable={false}
      />
    </div>
  );
}

export default memo(TreeFileNodeInner);
