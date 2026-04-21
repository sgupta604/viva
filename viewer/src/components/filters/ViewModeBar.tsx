import { useViewStore, type SortBy, type ViewMode } from "@/lib/state/view-store";

const MODES: { id: ViewMode; label: string }[] = [
  { id: "graph", label: "Graph" },
  { id: "folders", label: "Folders" },
  { id: "table", label: "Table" },
];

const SORT_OPTIONS: { id: SortBy; label: string }[] = [
  { id: "path", label: "path" },
  { id: "name", label: "name" },
  { id: "size", label: "size" },
  { id: "refCount", label: "refs" },
  { id: "parseStatus", label: "status" },
];

export function ViewModeBar() {
  const viewMode = useViewStore((s) => s.viewMode);
  const sortBy = useViewStore((s) => s.sortBy);
  const sortDir = useViewStore((s) => s.sortDir);
  const setViewMode = useViewStore((s) => s.setViewMode);
  const setSort = useViewStore((s) => s.setSort);

  return (
    <div
      className="flex flex-wrap items-center gap-3 border-b border-neutral-800 px-4 py-1.5 text-xs"
      data-testid="view-mode-bar"
    >
      <div className="flex items-center gap-1" role="group" aria-label="view mode">
        {MODES.map((m) => {
          const active = viewMode === m.id;
          return (
            <button
              key={m.id}
              type="button"
              aria-pressed={active}
              onClick={() => setViewMode(m.id)}
              data-testid={`view-mode-${m.id}`}
              className={`rounded px-2 py-1 font-mono ${
                active
                  ? "bg-neutral-800 text-neutral-100"
                  : "text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200"
              }`}
            >
              {m.label}
            </button>
          );
        })}
      </div>

      {viewMode !== "graph" && (
        <div className="flex items-center gap-2" data-testid="view-mode-sort-controls">
          <label className="flex items-center gap-1 text-neutral-400">
            <span>sort</span>
            <select
              value={sortBy}
              onChange={(e) => setSort(e.target.value as SortBy, sortDir)}
              className="rounded bg-neutral-900 px-2 py-1 font-mono text-neutral-100"
              data-testid="sort-by-select"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => setSort(sortBy, sortDir === "asc" ? "desc" : "asc")}
            aria-label={`sort ${sortDir === "asc" ? "ascending" : "descending"}`}
            data-testid="sort-dir-toggle"
            className="rounded bg-neutral-900 px-2 py-1 font-mono text-neutral-200 hover:bg-neutral-800"
          >
            {sortDir === "asc" ? "asc ↑" : "desc ↓"}
          </button>
        </div>
      )}
    </div>
  );
}
