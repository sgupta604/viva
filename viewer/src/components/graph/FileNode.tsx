import { memo } from "react";
import { Handle, Position } from "reactflow";
import { useSelectionStore } from "@/lib/state/selection-store";
import { useGraphStore } from "@/lib/state/graph-store";
import { highlightsFor } from "@/lib/highlight/param-refs";
import { NODE_W } from "@/lib/graph/layout";
import type { FileNode as FileNodeData } from "@/lib/graph/types";

interface Props {
  data: { file: FileNodeData };
  selected: boolean;
}

const KIND_COLOR: Record<string, string> = {
  xml: "border-kind-xml",
  yaml: "border-kind-yaml",
  json: "border-kind-json",
  ini: "border-kind-ini",
};

const KIND_BADGE: Record<string, string> = {
  xml: "bg-kind-xml/20 text-kind-xml",
  yaml: "bg-kind-yaml/20 text-kind-yaml",
  json: "bg-kind-json/20 text-kind-json",
  ini: "bg-kind-ini/20 text-kind-ini",
};

function FileNodeInner({ data, selected }: Props) {
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

  // Hover affordance — parity with TreeFileNode (`18d17f3`). Cluster-mode
  // FileNode previously had no visible feedback when hovered (edges lit up
  // but the node itself gave no signal that the hover was registering),
  // which was inconsistent with dendrogram/tree mode. Same `ring-1
  // ring-sky-300/60` token so the affordance reads identically across
  // modes. Param-highlight rings still win because they convey strictly
  // more state than either selection or hover.
  const isHovered = hoveredNodeId === f.id;

  // Dual-focus arbitration (user QA 2026-04-22, Bug #3): when the user has
  // selected a file (blue ring + lit edges) AND moved their mouse to a
  // different node (sky ring + that node's edges lit), edges already
  // arbitrate to hover (`focusedNodeId = hoveredNodeId ?? selectedFileId`
  // in GraphCanvas). Suppress the stale selection ring in the same case so
  // both visual channels — node ring AND lit edges — agree on a single
  // active focus instead of leaving the eye to ping between two rings.
  // Selection ring stays on the selected node when nothing else is
  // hovered (the natural "I clicked this; show me its world" state).
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

  // Pin the rendered width to the dagre layout constant so the DOM node
  // never exceeds its reserved slot. `truncate` on the inner <div>s clips
  // long filenames/folder paths; the title attribute surfaces the full
  // path on hover.
  // v2 generated-file variant — faded border + "gen" badge. Interaction
  // behaviour unchanged (still selectable, same handles).
  const generatedClass = f.generated
    ? "opacity-70 border-dashed"
    : "";

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`file ${f.path}`}
      data-testid={`node-${f.id}`}
      data-generated={f.generated ? "true" : undefined}
      style={{ width: NODE_W }}
      className={`rounded-md border-2 ${KIND_COLOR[f.kind]} bg-neutral-900 px-3 py-2 text-left shadow-md transition ${ring} ${generatedClass}`}
    >
      <Handle type="target" position={Position.Left} className="!bg-neutral-500" />
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1 truncate font-mono text-base text-neutral-100" title={f.name}>
          {f.name}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {f.generated && (
            <span
              className="rounded bg-amber-900/30 px-1 py-0.5 text-[9px] font-medium uppercase text-amber-300"
              aria-label="generated from template"
              title={
                f.generatedFrom
                  ? `generated from ${f.generatedFrom}`
                  : "generated"
              }
            >
              gen
            </span>
          )}
          <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${KIND_BADGE[f.kind]}`}>
            {f.kind}
          </span>
        </div>
      </div>
      <div className="truncate px-1.5 pt-0.5 text-xs text-neutral-500" title={f.folder || "/"}>
        {f.folder || "/"}
      </div>
      {f.parseError && (
        <div className="mt-1 truncate text-[10px] text-red-400" title={f.parseError}>
          parse error
        </div>
      )}
      <Handle type="source" position={Position.Right} className="!bg-neutral-500" />
    </div>
  );
}

export default memo(FileNodeInner);
