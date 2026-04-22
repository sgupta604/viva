import { memo } from "react";
import { Handle, Position } from "reactflow";
import { useSelectionStore } from "@/lib/state/selection-store";
import { useGraphStore } from "@/lib/state/graph-store";
import { highlightsFor } from "@/lib/highlight/param-refs";
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

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`file ${f.path}`}
      data-testid={`node-${f.id}`}
      className={`min-w-[200px] rounded-md border-2 ${KIND_COLOR[f.kind]} bg-neutral-900 px-3 py-2 text-left shadow-md transition ${ring}`}
    >
      <Handle type="target" position={Position.Left} className="!bg-neutral-500" />
      <div className="flex items-center justify-between gap-2">
        <div className="truncate font-mono text-base text-neutral-100">{f.name}</div>
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${KIND_BADGE[f.kind]}`}>
          {f.kind}
        </span>
      </div>
      <div className="truncate px-1.5 pt-0.5 text-xs text-neutral-500">{f.folder || "/"}</div>
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
