import { useMemo } from "react";
import { useGraphStore } from "@/lib/state/graph-store";
import { useFilterStore } from "@/lib/state/filter-store";
import { useSelectionStore } from "@/lib/state/selection-store";
import { useViewStore, type SortBy } from "@/lib/state/view-store";
import { applyFilters } from "@/lib/filters/predicates";
import { sortFiles } from "@/lib/views/sort";

interface Column {
  id: SortBy | null; // null = not sortable
  label: string;
  testId: string;
}

const COLUMNS: Column[] = [
  { id: "name", label: "Name", testId: "table-view-col-name" },
  { id: "path", label: "Path", testId: "table-view-col-path" },
  { id: null, label: "Kind", testId: "table-view-col-kind" },
  { id: "size", label: "Size", testId: "table-view-col-size" },
  { id: "refCount", label: "Refs", testId: "table-view-col-refs" },
  { id: "parseStatus", label: "Status", testId: "table-view-col-status" },
];

export function TableView() {
  const graph = useGraphStore((s) => s.graph);
  const kinds = useFilterStore((s) => s.kinds);
  const hideTests = useFilterStore((s) => s.hideTests);
  const folder = useFilterStore((s) => s.folder);
  const searchQuery = useFilterStore((s) => s.searchQuery);
  const sortBy = useViewStore((s) => s.sortBy);
  const sortDir = useViewStore((s) => s.sortDir);
  const setSort = useViewStore((s) => s.setSort);
  const selectFile = useSelectionStore((s) => s.selectFile);
  const selectedFileId = useSelectionStore((s) => s.selectedFileId);

  const rows = useMemo(() => {
    if (!graph) return [];
    const filtered = applyFilters(graph, { kinds, hideTests, folder, searchQuery });
    const refs = new Map<string, number>();
    for (const e of filtered.edges) {
      refs.set(e.source, (refs.get(e.source) ?? 0) + 1);
    }
    return sortFiles(filtered.files, filtered.edges, sortBy, sortDir).map((f) => ({
      file: f,
      refs: refs.get(f.id) ?? 0,
    }));
  }, [graph, kinds, hideTests, folder, searchQuery, sortBy, sortDir]);

  if (!graph) return null;

  if (rows.length === 0) {
    return (
      <div
        className="flex h-full items-center justify-center text-sm text-neutral-500"
        data-testid="table-view-empty"
      >
        no files match current filters
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto" data-testid="table-view">
      <table className="w-full border-collapse text-xs">
        <thead className="sticky top-0 bg-neutral-950">
          <tr className="border-b border-neutral-800 text-neutral-400">
            {COLUMNS.map((col) => {
              const active = col.id !== null && sortBy === col.id;
              const indicator = active ? (sortDir === "asc" ? " ▲" : " ▼") : "";
              return (
                <th
                  key={col.label}
                  data-testid={col.testId}
                  className={`px-3 py-1.5 text-left font-mono font-normal ${
                    col.id ? "cursor-pointer hover:text-neutral-100" : ""
                  } ${active ? "text-neutral-100" : ""}`}
                  onClick={() => {
                    if (col.id) setSort(col.id);
                  }}
                >
                  {col.label}
                  {indicator}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ file, refs }) => {
            const active = selectedFileId === file.id;
            return (
              <tr
                key={file.id}
                data-testid={`table-view-row-${file.id}`}
                onClick={() => selectFile(file.id)}
                className={`cursor-pointer border-b border-neutral-800/50 font-mono ${
                  active
                    ? "bg-neutral-800 text-neutral-100"
                    : "text-neutral-300 hover:bg-neutral-800/30"
                }`}
              >
                <td className="px-3 py-1">{file.name}</td>
                <td className="px-3 py-1 text-neutral-500">{file.folder || "(root)"}</td>
                <td className="px-3 py-1">
                  <span className="rounded bg-neutral-800 px-1 text-[10px] uppercase text-neutral-400">
                    {file.kind}
                  </span>
                </td>
                <td className="px-3 py-1 text-neutral-400">{file.sizeBytes}</td>
                <td className="px-3 py-1 text-neutral-400">{refs}</td>
                <td className="px-3 py-1">
                  {file.parseError ? (
                    <span
                      className="flex items-center gap-1 text-red-400"
                      title={file.parseError}
                      data-testid={`table-view-status-error-${file.id}`}
                    >
                      <span
                        aria-hidden="true"
                        className="inline-block h-1.5 w-1.5 rounded-full bg-red-500"
                      />
                      error
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-emerald-400">
                      <span
                        aria-hidden="true"
                        className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500"
                      />
                      ok
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
