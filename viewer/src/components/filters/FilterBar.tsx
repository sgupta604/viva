import { useMemo } from "react";
import { useReactFlow, type Node } from "reactflow";
import { useFilterStore } from "@/lib/state/filter-store";
import { useGraphStore } from "@/lib/state/graph-store";
import { useHierarchyStore } from "@/lib/state/hierarchy-store";
import { applyFilters } from "@/lib/filters/predicates";
import type { FileKind } from "@/lib/graph/types";

const KINDS: FileKind[] = ["xml", "yaml", "json", "ini"];

/**
 * Absolute position of a React Flow node, accounting for compound-node
 * `parentNode` nesting: child positions are stored relative to their parent,
 * so we sum offsets along the parent chain.
 */
function absolutePosition(
  node: Node,
  allById: Map<string, Node>,
): { x: number; y: number } {
  let x = node.position.x;
  let y = node.position.y;
  let parentId = node.parentNode;
  let safety = 32;
  while (parentId && safety > 0) {
    const p = allById.get(parentId);
    if (!p) break;
    x += p.position.x;
    y += p.position.y;
    parentId = p.parentNode;
    safety -= 1;
  }
  return { x, y };
}

/** Absolute bounding rect covering the given nodes; sized + positioned. */
function boundingRect(
  nodes: Node[],
  allById: Map<string, Node>,
): { x: number; y: number; width: number; height: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    const { x, y } = absolutePosition(n, allById);
    const w = n.width ?? 0;
    const h = n.height ?? 0;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x + w > maxX) maxX = x + w;
    if (y + h > maxY) maxY = y + h;
  }
  if (!isFinite(minX)) return { x: 0, y: 0, width: 0, height: 0 };
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

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
  let fitBounds:
    | ((bounds: { x: number; y: number; width: number; height: number }) => void)
    | null = null;
  let getNode: ((id: string) => Node | undefined) | null = null;
  let getNodes: (() => Node[]) | null = null;
  try {
    const rf = useReactFlow();
    fitView = () => rf.fitView({ padding: 0.15, duration: 400 });
    fitBounds = (bounds) =>
      rf.fitBounds(bounds, { padding: 0.2, duration: 400 });
    getNode = (id) => rf.getNode(id);
    getNodes = () => rf.getNodes();
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
    // Jump to folder: expand the ancestor chain and navigate the viewport
    // to the target cluster. Expansion triggers a layout recompute on the
    // next tick; React Flow then measures nodes asynchronously via
    // ResizeObserver. We poll getNode up to ~500ms for the measured target
    // before falling back to the best ancestor we can measure.
    expandToPath(val);

    const tryNavigate = (attempt: number): void => {
      if (!getNode || !fitBounds) {
        if (fitView) fitView();
        return;
      }
      const all = getNodes?.() ?? [];
      const allById = new Map(all.map((n) => [n.id, n]));
      const target = getNode(val);
      if (target && target.width != null && target.height != null) {
        fitBounds(boundingRect([target], allById));
        return;
      }
      if (attempt < 10) {
        // React Flow measures nodes asynchronously via ResizeObserver — poll.
        if (typeof window !== "undefined") {
          window.requestAnimationFrame(() => tryNavigate(attempt + 1));
        }
        return;
      }
      // Give up waiting; fit the closest ancestor we CAN measure.
      const ancestors = val.split("/").map((_, i, a) => a.slice(0, i + 1).join("/"));
      const hits = all.filter(
        (n) => ancestors.includes(n.id) && n.width != null && n.height != null,
      );
      if (hits.length === 0) {
        if (fitView) fitView();
        return;
      }
      fitBounds(boundingRect(hits, allById));
    };

    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => tryNavigate(0));
    } else {
      tryNavigate(0);
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
