/**
 * Always-visible edge legend chip.
 *
 * Positioning (user feedback 2026-04-22): top-right of the graph canvas.
 * Was previously bottom-left, where it covered React Flow's <Controls />
 * fit-view button. Top-right keeps it out of the way of both the controls
 * and the bottom-right read-only hint.
 *
 * Detail-panel avoidance (user QA 2026-04-22, Bug #7): the detail panel
 * opens as a 400px-wide fixed aside anchored bottom-right top:96px. At a
 * typical 1600-wide viewport it sits directly over the top-right legend.
 * When a file is selected (panel open), shift the legend left so it clears
 * the panel. 416px = 400px panel + 16px breathing margin, matching the
 * 12px chip inset from the canvas edge.
 *
 * Content varies by graph layout:
 *   - flat modes (dendrogram, tree) → compact 2-row legend (hierarchy +
 *     reference) — matches the 2-color flat palette in EdgeStyles.ts.
 *   - clusters mode                 → full 6-row legend driven by
 *     EDGE_KIND_META.
 *
 * Both forms read from EdgeStyles.ts so a new edge kind (cluster mode) or
 * a palette tweak (flat modes) cannot drift between renderer and legend.
 *
 * The `data-legend-mode` attribute reads `tree` for both flat modes (kept
 * for backwards-compat with existing E2E selectors).
 *
 * Collapsible (default expanded). Collapse state persists in
 * `useViewStore.legendCollapsed` so a reload remembers the user's choice.
 */
import { useViewStore } from "@/lib/state/view-store";
import { useSelectionStore } from "@/lib/state/selection-store";
import { EDGE_KIND_META, TREE_LEGEND_ROWS } from "./EdgeStyles";

export function EdgeLegend() {
  const collapsed = useViewStore((s) => s.legendCollapsed);
  const setCollapsed = useViewStore((s) => s.setLegendCollapsed);
  const graphLayout = useViewStore((s) => s.graphLayout);
  const selectedFileId = useSelectionStore((s) => s.selectedFileId);
  const isFlatMode = graphLayout === "tree" || graphLayout === "dendrogram";
  const panelOpen = selectedFileId !== null;

  // Build a unified row array so the JSX below stays single-shape; each
  // row carries its own data-testid suffix so existing per-kind selectors
  // continue to work in cluster mode and flat modes get `hierarchy` /
  // `reference` selectors.
  const rows = isFlatMode
    ? TREE_LEGEND_ROWS.map((r) => ({
        key: r.bucket,
        testIdSuffix: r.bucket,
        color: r.color,
        strokeWidth: r.strokeWidth,
        dasharray: undefined as string | undefined,
        label: r.label,
      }))
    : EDGE_KIND_META.map((m) => ({
        key: m.kind,
        testIdSuffix: m.kind,
        color: m.color,
        strokeWidth: m.strokeWidth,
        dasharray: m.dasharray,
        label: m.label,
      }));

  // Inline `right` so the value can switch between two pixel literals
  // (12px when no panel, 416px when the 400-px detail panel is open) —
  // Tailwind's right-3 / right-[416px] would JIT both classes but the
  // inline style is the simplest single-value swap and reads identically
  // to the test that locks the position invariant.
  const rightOffsetPx = panelOpen ? 416 : 12;
  return (
    <div
      className="pointer-events-auto absolute top-3 z-20 rounded-md border border-neutral-700 bg-neutral-900/90 px-2 py-1.5 text-[11px] text-neutral-300 shadow-md backdrop-blur-sm transition-all"
      style={{ right: `${rightOffsetPx}px` }}
      data-testid="edge-legend"
      data-legend-mode={isFlatMode ? "tree" : "clusters"}
      data-panel-open={panelOpen ? "true" : "false"}
      aria-label="edge color legend"
    >
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        aria-expanded={!collapsed}
        data-testid="edge-legend-toggle"
        className="flex w-full items-center justify-between gap-2 font-mono text-neutral-200 hover:text-neutral-50"
      >
        <span>edges</span>
        <span aria-hidden="true" className="text-neutral-500">
          {collapsed ? "+" : "−"}
        </span>
      </button>

      {!collapsed && (
        <ul className="mt-1.5 flex flex-col gap-1" data-testid="edge-legend-list">
          {rows.map((r) => (
            <li
              key={r.key}
              className="flex items-center gap-2 font-mono"
              data-testid={`edge-legend-item-${r.testIdSuffix}`}
            >
              <svg
                width="22"
                height="6"
                aria-hidden="true"
                className="flex-shrink-0"
              >
                <line
                  x1="0"
                  y1="3"
                  x2="22"
                  y2="3"
                  stroke={r.color}
                  strokeWidth={Math.max(1.5, r.strokeWidth)}
                  strokeDasharray={r.dasharray}
                />
              </svg>
              <span className="text-neutral-300">{r.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
