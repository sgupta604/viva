import { useEffect, useMemo, useState } from "react";
import { useGraphStore } from "@/lib/state/graph-store";
import { useSelectionStore } from "@/lib/state/selection-store";
import { buildIndex } from "@/lib/search";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SearchPalette({ open, onOpenChange }: Props) {
  const graph = useGraphStore((s) => s.graph);
  const selectFile = useSelectionStore((s) => s.selectFile);
  const [query, setQuery] = useState("");

  const fuse = useMemo(() => (graph ? buildIndex(graph) : null), [graph]);
  const hits = useMemo(() => {
    if (!fuse || !query.trim()) return [];
    return fuse.search(query).slice(0, 12);
  }, [fuse, query]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center bg-black/50 p-16"
      onClick={() => onOpenChange(false)}
      role="presentation"
    >
      <div
        role="dialog"
        aria-label="search"
        className="w-[520px] overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="search files, params…"
          className="w-full bg-neutral-900 px-4 py-3 font-mono text-sm text-neutral-100 outline-none"
          data-testid="search-input"
          onKeyDown={(e) => {
            if (e.key === "Enter" && hits[0]) {
              selectFile(hits[0].item.id);
              onOpenChange(false);
            }
          }}
        />
        <ul className="max-h-[360px] overflow-auto border-t border-neutral-800">
          {hits.length === 0 && query && (
            <li className="px-4 py-3 text-xs text-neutral-500">no matches</li>
          )}
          {hits.map((hit) => (
            <li key={hit.item.id}>
              <button
                type="button"
                className="flex w-full items-center justify-between px-4 py-2 text-left text-sm hover:bg-neutral-800"
                data-testid={`search-hit-${hit.item.id}`}
                onClick={() => {
                  selectFile(hit.item.id);
                  onOpenChange(false);
                }}
              >
                <span className="truncate font-mono text-neutral-100">{hit.item.name}</span>
                <span className="ml-2 truncate text-xs text-neutral-500">{hit.item.path}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
