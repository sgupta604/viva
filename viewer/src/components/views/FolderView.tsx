import { useMemo } from "react";
import { useGraphStore } from "@/lib/state/graph-store";
import { useFilterStore } from "@/lib/state/filter-store";
import { useSelectionStore } from "@/lib/state/selection-store";
import { useViewStore } from "@/lib/state/view-store";
import { applyFilters } from "@/lib/filters/predicates";
import { sortFiles } from "@/lib/views/sort";
import { groupByFolder } from "@/lib/views/group";

export function FolderView() {
  const graph = useGraphStore((s) => s.graph);
  const kinds = useFilterStore((s) => s.kinds);
  const hideTests = useFilterStore((s) => s.hideTests);
  const folder = useFilterStore((s) => s.folder);
  const searchQuery = useFilterStore((s) => s.searchQuery);
  const sortBy = useViewStore((s) => s.sortBy);
  const sortDir = useViewStore((s) => s.sortDir);
  const selectFile = useSelectionStore((s) => s.selectFile);
  const selectedFileId = useSelectionStore((s) => s.selectedFileId);

  const buckets = useMemo(() => {
    if (!graph) return [];
    const filtered = applyFilters(graph, { kinds, hideTests, folder, searchQuery });
    const sorted = sortFiles(filtered.files, filtered.edges, sortBy, sortDir);
    return groupByFolder(sorted);
  }, [graph, kinds, hideTests, folder, searchQuery, sortBy, sortDir]);

  if (!graph) return null;

  if (buckets.length === 0) {
    return (
      <div
        className="flex h-full items-center justify-center text-sm text-neutral-500"
        data-testid="folder-view-empty"
      >
        no files match current filters
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-3 text-sm" data-testid="folder-view">
      {buckets.map((bucket) => (
        <details
          key={bucket.folder || "(root)"}
          open
          className="mb-2 rounded border border-neutral-800 bg-neutral-900/30"
        >
          <summary className="cursor-pointer select-none px-3 py-1.5 font-mono text-xs text-neutral-300 hover:bg-neutral-800/50">
            {bucket.folder || "(root)"}
            <span className="ml-2 text-neutral-500">({bucket.files.length})</span>
          </summary>
          <ul>
            {bucket.files.map((f) => {
              const active = selectedFileId === f.id;
              return (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() => selectFile(f.id)}
                    data-testid={`folder-view-row-${f.id}`}
                    className={`flex w-full items-center gap-2 border-t border-neutral-800/50 px-3 py-1 text-left font-mono text-xs ${
                      active
                        ? "bg-neutral-800 text-neutral-100"
                        : "text-neutral-300 hover:bg-neutral-800/30"
                    }`}
                  >
                    <span
                      className="rounded bg-neutral-800 px-1 text-[10px] uppercase text-neutral-400"
                      aria-label={`kind ${f.kind}`}
                    >
                      {f.kind}
                    </span>
                    <span className="truncate">{f.name}</span>
                    <span className="ml-auto text-neutral-500">
                      {f.sizeBytes} B
                    </span>
                    {f.parseError && (
                      <span
                        className="text-red-400"
                        aria-label="parse error"
                        title={f.parseError}
                      >
                        !
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </details>
      ))}
    </div>
  );
}
