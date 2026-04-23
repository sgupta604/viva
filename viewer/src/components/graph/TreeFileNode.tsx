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
  const hoveredNodeId = useSelectionStore((s) => s.hoveredNodeId);
  const graph = useGraphStore((s) => s.graph);

  let highlight: "strong" | "muted" | null = null;
  if (selectedParamKey && graph) {
    const h = highlightsFor(selectedParamKey, graph);
    if (h.edgeResolved.has(f.id)) highlight = "strong";
    else if (h.nameMatch.has(f.id)) highlight = "muted";
  }

  // Hover affordance (Change 4, user feedback 2026-04-22): when the user
  // hovers this card, brighten its border slightly so they get a clear
  // visual confirmation that "this hover IS what's lighting up the cross-
  // ref edges." Sky-300 at 60% so it reads as a soft accent — not loud
  // enough to compete with the selected-blue ring or the amber param-
  // highlight.
  const isHovered = hoveredNodeId === f.id;

  // Dual-focus arbitration (user QA 2026-04-22, Bug #3): when the user has
  // selected a file AND moved their mouse to a different node, edges
  // already arbitrate to hover (`focusedNodeId = hoveredNodeId ??
  // selectedFileId` in GraphCanvas). Suppress the stale selection ring in
  // the same case so both visual channels — node ring AND lit edges — agree
  // on a single active focus instead of leaving the eye to ping between
  // two rings. Selection ring stays on the selected node when nothing else
  // is hovered (the natural "I clicked this; show me its world" state).
  const isHoverDisplaceSelection =
    selected && hoveredNodeId !== null && hoveredNodeId !== f.id;

  const ring =
    highlight === "strong"
      ? "ring-2 ring-amber-400"
      : highlight === "muted"
        ? "ring-1 ring-amber-400/40"
        : selected && !isHoverDisplaceSelection
          ? "ring-2 ring-blue-400"
          : isHovered
            ? "ring-1 ring-sky-300/60"
            : "";

  // Light-blue fill for leaf files matches the reference image's leaf
  // styling. `generated` files dim slightly so the synthetic ones recede.
  //
  // Background: changed from `bg-sky-950/60` (60% alpha) to opaque
  // `bg-sky-950` (Change 3, user feedback 2026-04-22). The translucent
  // background let cross-ref edge SVG paths bleed through the file-name
  // text — Image #14 had a cyan line literally cutting through the word
  // "dangling". Even though the node sits at zIndex 1100 above the edge
  // layer (1000), a translucent fill means the SVG underneath shows
  // through the rendered text. Opaque fill paired with the existing
  // zIndex bump fully resolves the readability issue.
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
      className={`flex items-center gap-2 rounded-md border border-sky-700/50 bg-sky-950 px-2.5 py-1 text-left shadow-sm transition ${ring} ${generatedClass} ${parseFailClass}`}
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
