/**
 * Graph-mode-only sub-toggle: which layout drives the canvas. Mounted by
 * ViewModeBar only when `viewMode === "graph"` — folders/table modes don't
 * have a layout choice.
 *
 * Three pills (2026-04-22 dendrogram continuation):
 *   - Dendrogram (default) — flat folder/file labels, drawn hierarchy edges,
 *     matches the user's reference image
 *   - Tree                 — original mrtree-on-cluster-containment layout;
 *     kept for layout-comparison value on real codebases
 *   - Clusters             — recursive box-in-box compound nodes
 *
 * Pill styling matches the existing view-mode pill so the chrome reads as
 * one cohesive bar (active = bg-neutral-800 text-neutral-100; inactive =
 * neutral hover). Test ids follow the `view-mode-${id}` convention used by
 * the parent bar so Playwright selectors stay regular.
 */
import { useViewStore, type GraphLayout } from "@/lib/state/view-store";

const LAYOUTS: { id: GraphLayout; label: string }[] = [
  { id: "dendrogram", label: "Dendrogram" },
  { id: "tree", label: "Tree" },
  { id: "clusters", label: "Clusters" },
];

export function GraphLayoutToggle() {
  const graphLayout = useViewStore((s) => s.graphLayout);
  const setGraphLayout = useViewStore((s) => s.setGraphLayout);

  return (
    <div
      className="flex items-center gap-1"
      role="group"
      aria-label="graph layout"
      data-testid="graph-layout-toggle"
    >
      {LAYOUTS.map((l) => {
        const active = graphLayout === l.id;
        return (
          <button
            key={l.id}
            type="button"
            aria-pressed={active}
            onClick={() => setGraphLayout(l.id)}
            data-testid={`graph-layout-${l.id}`}
            className={`rounded px-2 py-1 font-mono ${
              active
                ? "bg-neutral-800 text-neutral-100"
                : "text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200"
            }`}
          >
            {l.label}
          </button>
        );
      })}
    </div>
  );
}
