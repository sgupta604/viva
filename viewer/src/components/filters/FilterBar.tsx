import { useMemo } from "react";
import { useFilterStore } from "@/lib/state/filter-store";
import { useGraphStore } from "@/lib/state/graph-store";
import { applyFilters } from "@/lib/filters/predicates";
import type { FileKind } from "@/lib/graph/types";

const KINDS: FileKind[] = ["xml", "yaml", "json", "ini"];

export function FilterBar() {
  const graph = useGraphStore((s) => s.graph);
  const kinds = useFilterStore((s) => s.kinds);
  const hideTests = useFilterStore((s) => s.hideTests);
  const folder = useFilterStore((s) => s.folder);
  const searchQuery = useFilterStore((s) => s.searchQuery);
  const toggleKind = useFilterStore((s) => s.toggleKind);
  const setHideTests = useFilterStore((s) => s.setHideTests);
  const setFolder = useFilterStore((s) => s.setFolder);

  const folders = useMemo(() => {
    if (!graph) return [];
    return Array.from(new Set(graph.files.map((f) => f.folder || "."))).sort();
  }, [graph]);

  const counts = useMemo(() => {
    if (!graph) return { visible: 0, total: 0 };
    const filtered = applyFilters(graph, { kinds, hideTests, folder, searchQuery });
    return { visible: filtered.files.length, total: graph.files.length };
  }, [graph, kinds, hideTests, folder, searchQuery]);

  return (
    <div
      className="flex flex-wrap items-center gap-3 border-b border-neutral-800 px-4 py-1.5 text-xs"
      data-testid="filter-bar"
    >
      <span className="font-mono text-neutral-500">
        {counts.visible}/{counts.total} files
      </span>
      <div className="flex items-center gap-2">
        {KINDS.map((k) => (
          <label
            key={k}
            className={`flex cursor-pointer items-center gap-1 rounded px-2 py-1 ${
              kinds.has(k) ? "bg-neutral-800 text-neutral-100" : "text-neutral-500"
            }`}
          >
            <input
              type="checkbox"
              checked={kinds.has(k)}
              onChange={() => toggleKind(k)}
              className="accent-neutral-400"
              data-testid={`filter-kind-${k}`}
            />
            <span className="font-mono uppercase">{k}</span>
          </label>
        ))}
      </div>
      <label className="flex cursor-pointer items-center gap-1 text-neutral-300">
        <input
          type="checkbox"
          checked={hideTests}
          onChange={(e) => setHideTests(e.target.checked)}
          className="accent-neutral-400"
          data-testid="filter-hide-tests"
        />
        hide tests
      </label>
      <label className="flex items-center gap-1 text-neutral-400">
        <span>folder</span>
        <select
          value={folder ?? ""}
          onChange={(e) => setFolder(e.target.value || null)}
          className="rounded bg-neutral-900 px-2 py-1 font-mono text-neutral-100"
          data-testid="filter-folder"
        >
          <option value="">(all)</option>
          {folders.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
