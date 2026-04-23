import { useMemo, useState } from "react";
import { useSelectionStore } from "@/lib/state/selection-store";
import { useGraphStore } from "@/lib/state/graph-store";
import { ParamTree } from "./ParamTree";
import { RawSourceView } from "./RawSourceView";

type Tab = "params" | "raw";

export function FileDetailPanel() {
  const selectedFileId = useSelectionStore((s) => s.selectedFileId);
  const detailPanelOpen = useSelectionStore((s) => s.detailPanelOpen);
  const closeDetailPanel = useSelectionStore((s) => s.closeDetailPanel);
  const graph = useGraphStore((s) => s.graph);
  const [tab, setTab] = useState<Tab>("params");

  const file = useMemo(() => {
    if (!selectedFileId || !graph) return null;
    return graph.files.find((f) => f.id === selectedFileId) ?? null;
  }, [selectedFileId, graph]);

  // Panel renders only when BOTH a file is selected AND the panel is open.
  // Selection alone no longer forces the panel — the autoOpenDetailPanel
  // view-store toggle gates whether a click implicitly opens it (see
  // GraphCanvas onNodeClick wiring). Close button hides the panel without
  // clearing selection so the focus-revealed edges stay lit.
  if (!file || !detailPanelOpen) return null;

  return (
    <aside
      role="dialog"
      aria-label={`details for ${file.path}`}
      data-testid="file-detail-panel"
      className="fixed bottom-0 right-0 top-[96px] z-30 flex w-[400px] flex-col border-l border-neutral-800 bg-neutral-950 shadow-2xl"
    >
      <div className="flex items-start justify-between gap-2 border-b border-neutral-800 p-3">
        <div className="min-w-0">
          <div className="truncate font-mono text-sm text-neutral-100">{file.name}</div>
          <div className="truncate text-xs text-neutral-500">{file.path}</div>
          {file.parseError && (
            <div className="mt-1 text-xs text-red-400">
              parse error: {file.parseError}
              {tab === "params" && (
                <>
                  {" "}
                  <button
                    type="button"
                    onClick={() => setTab("raw")}
                    data-testid="view-raw-anyway"
                    className="ml-1 text-blue-400 underline hover:text-blue-300"
                  >
                    view raw anyway
                  </button>
                </>
              )}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={closeDetailPanel}
          aria-label="close details"
          className="rounded px-2 py-1 text-xs text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
        >
          ×
        </button>
      </div>
      <div className="flex gap-1 border-b border-neutral-800 px-3 py-1 text-xs">
        <button
          type="button"
          onClick={() => setTab("params")}
          className={`rounded px-2 py-1 ${tab === "params" ? "bg-neutral-800 text-neutral-100" : "text-neutral-400 hover:bg-neutral-900"}`}
          data-testid="tab-params"
        >
          params ({file.params.length})
        </button>
        <button
          type="button"
          onClick={() => setTab("raw")}
          className={`rounded px-2 py-1 ${tab === "raw" ? "bg-neutral-800 text-neutral-100" : "text-neutral-400 hover:bg-neutral-900"}`}
          data-testid="tab-raw"
        >
          raw
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {tab === "params" ? <ParamTree params={file.params} /> : <RawSourceView file={file} />}
      </div>
    </aside>
  );
}
