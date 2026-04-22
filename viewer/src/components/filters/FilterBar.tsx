import { useMemo } from "react";
import { useReactFlow } from "reactflow";
import { useFilterStore } from "@/lib/state/filter-store";
import { useGraphStore } from "@/lib/state/graph-store";
import { useHierarchyStore } from "@/lib/state/hierarchy-store";
import { applyFilters } from "@/lib/filters/predicates";
import type { FileKind } from "@/lib/graph/types";

const KINDS: FileKind[] = ["xml", "yaml", "json", "ini"];

/**
 * V.7 — the folder dropdown's semantics flip from HIDE to NAVIGATE.
 *
 * Picking a folder:
 *   1. expandToPath(folder) — hierarchyStore opens every ancestor
 *   2. fitView() or fitBounds() on the focused cluster — react-flow centers it
 *   3. Sibling clusters stay in the DOM (collapsed). No context is stripped.
 *
 * Picking "(all)" collapses back to top-level and fits the full graph.
 */
export function FilterBar() {
  const graph = useGraphStore((s) => s.graph);
  const kinds = useFilterStore((s) => s.kinds);
  const hideTests = useFilterStore((s) => s.hideTests);
  const folder = useFilterStore((s) => s.folder);
  const searchQuery = useFilterStore((s) => s.searchQuery);
  const toggleKind = useFilterStore((s) => s.toggleKind);
  const setHideTests = useFilterStore((s) => s.setHideTests);
  const setFolder = useFilterStore((s) => s.setFolder);

  const expandToPath = useHierarchyStore((s) => s.expandToPath);
  const collapseAll = useHierarchyStore((s) => s.collapseAll);

  // useReactFlow is only valid when a ReactFlowProvider is in scope. FilterBar
  // renders above the canvas so we guard with a try/catch when the provider
  // isn't mounted (e.g. Folder/Table views).
  let fitView: (() => void) | null = null;
  let fitBounds: ((bounds: { x: number; y: number; width: number; height: number }) => void) | null = null;
  try {
    const rf = useReactFlow();
    fitView = () => rf.fitView({ padding: 0.15 });
    fitBounds = (bounds) => rf.fitBounds(bounds, { padding: 0.2 });
  } catch {
    // no provider — navigation fitView is a no-op
  }

  const folders = useMemo(() => {
    if (!graph) return [];
    // Derive the folder list from clusters when present (v2), else from
    // file folders (v1 fallback).
    if (graph.clusters && graph.clusters.length > 0) {
      return Array.from(new Set(graph.clusters.map((c) => c.path))).sort();
    }
    return Array.from(new Set(graph.files.map((f) => f.folder || "."))).sort();
  }, [graph]);

  const counts = useMemo(() => {
    if (!graph) return { visible: 0, total: 0 };
    // Count under kinds+hideTests+searchQuery filters ONLY — folder is
    // NAVIGATE, not HIDE.
    const filtered = applyFilters(graph, {
      kinds,
      hideTests,
      folder: null,
      searchQuery,
    });
    return { visible: filtered.files.length, total: graph.files.length };
  }, [graph, kinds, hideTests, searchQuery]);

  const onFolderChange = (val: string) => {
    setFolder(val || null);
    if (!val) {
      // "(all)" — collapse everything and fit the full graph.
      collapseAll();
      if (fitView) fitView();
      return;
    }
    // Jump to folder: expand ancestors and fit the cluster area.
    expandToPath(val);
    if (fitBounds && graph?.clusters) {
      // Heuristic fit: rely on the consumer's fitView after expansion — a
      // precise cluster bound needs the laid-out graph, which FilterBar
      // doesn't compute. fitView is a safe fallback. E2E specs assert
      // sibling preservation by checking DOM presence.
      if (fitView) fitView();
    } else if (fitView) {
      fitView();
    }
  };

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
        <span>jump to folder</span>
        <select
          value={folder ?? ""}
          onChange={(e) => onFolderChange(e.target.value)}
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
