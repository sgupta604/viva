import { useEffect, useState } from "react";
import { loadGraph, type LoadResult } from "@/lib/graph/load";
import { useGraphStore } from "@/lib/state/graph-store";
import { useSelectionStore } from "@/lib/state/selection-store";
import { useFilterStore } from "@/lib/state/filter-store";
import { useViewStore } from "@/lib/state/view-store";
import { GraphCanvas } from "@/components/graph/GraphCanvas";
import { FileDetailPanel } from "@/components/panels/FileDetailPanel";
import { FilterBar } from "@/components/filters/FilterBar";
import { ViewModeBar } from "@/components/filters/ViewModeBar";
import { FolderView } from "@/components/views/FolderView";
import { TableView } from "@/components/views/TableView";
import { SearchPalette } from "@/components/search/SearchPalette";

export default function App() {
  const setGraph = useGraphStore((s) => s.setGraph);
  const setStatus = useGraphStore((s) => s.setStatus);
  const setError = useGraphStore((s) => s.setError);
  const status = useGraphStore((s) => s.status);
  const error = useGraphStore((s) => s.error);

  const [paletteOpen, setPaletteOpen] = useState(false);
  const clearSelection = useSelectionStore((s) => s.clear);
  const resetFilters = useFilterStore((s) => s.reset);
  const viewMode = useViewStore((s) => s.viewMode);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    loadGraph()
      .then((result: LoadResult) => {
        if (cancelled) return;
        if (result.ok) {
          setGraph(result.graph);
          setStatus("ready");
        } else {
          setError(result.error);
          setStatus("error");
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError(String(err));
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [setGraph, setStatus, setError]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      } else if (e.key === "Escape") {
        setPaletteOpen(false);
        clearSelection();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clearSelection]);

  // Reset filters only once per fresh load.
  useEffect(() => {
    if (status === "ready") {
      resetFilters();
    }
  }, [status, resetFilters]);

  return (
    <div className="flex h-full w-full flex-col bg-neutral-950 text-neutral-100">
      <header className="flex items-center justify-between border-b border-neutral-800 px-4 py-2">
        <div className="flex items-center gap-3">
          <h1 className="font-mono text-lg font-semibold tracking-tight">viva</h1>
          <span className="text-xs text-neutral-500">config visualizer</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-neutral-400">
          <kbd className="rounded border border-neutral-700 px-1.5 py-0.5 font-mono">Ctrl/Cmd+K</kbd>
          <span>search</span>
        </div>
      </header>

      <FilterBar />
      <ViewModeBar />

      <main className="relative flex-1 overflow-hidden">
        {status === "loading" && (
          <div className="flex h-full items-center justify-center text-neutral-400">
            loading graph…
          </div>
        )}
        {status === "error" && (
          <div
            role="alert"
            className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center"
          >
            <div className="font-semibold text-red-400">graph.json failed to load</div>
            <code className="max-w-xl font-mono text-xs text-neutral-400">{error}</code>
            <p className="text-xs text-neutral-500">
              Run the crawler and copy the output to <code>viewer/public/graph.json</code>.
            </p>
          </div>
        )}
        {status === "ready" && viewMode === "graph" && <GraphCanvas />}
        {status === "ready" && viewMode === "folders" && <FolderView />}
        {status === "ready" && viewMode === "table" && <TableView />}
      </main>

      <FileDetailPanel />
      <SearchPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
