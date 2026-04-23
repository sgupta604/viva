/**
 * Always-visible edge legend chip.
 *
 * Positioning (user feedback 2026-04-22): top-right of the graph canvas.
 * Was previously bottom-left, where it covered React Flow's <Controls />
 * fit-view button. Top-right keeps it out of the way of both the controls
 * and the bottom-right read-only hint.
 *
 * Detail-panel avoidance (user QA 2026-04-22, Bug #7; refined 2026-04-23):
 * the detail panel opens as a 400px-wide fixed aside anchored bottom-right
 * top:96px. At a typical 1600-wide viewport it sits directly over the
 * top-right legend. When the panel is OPEN, shift the legend left so it
 * clears it. 416px = 400px panel + 16px breathing margin.
 *
 * The slide is keyed off `detailPanelOpen` — the actual panel-visible flag
 * — NOT `selectedFileId`. Two earlier bugs the latter caused (visual-review
 * 2026-04-23):
 *   1. With auto-open-panel toggled OFF, clicking a file updated selection
 *      WITHOUT opening the panel, but the legend still slid as if the panel
 *      were there.
 *   2. After the user manually closed the panel via its X button,
 *      `selectedFileId` was still set so the legend stayed in the
 *      slid-out position with no panel beside it.
 * `detailPanelOpen` is the single source of truth FileDetailPanel itself
 * reads (see FileDetailPanel.tsx:`if (!file || !detailPanelOpen) return null`),
 * so keying off it makes the two surfaces lockstep by construction.
 *
 * Content (user feedback 2026-04-22, follow-up): every layout — dendrogram,
 * tree, clusters — renders the full 6-row legend driven by EDGE_KIND_META.
 * Earlier the flat modes showed a compact 2-row legend (hierarchy + reference)
 * because the default flat-mode palette is amber-everywhere; but on hover
 * the focus-revealed palette switches edges to their per-kind color
 * (include blue, import green, xsd green-dashed, etc.) and the 2-row
 * legend left users with no key for what those colors meant. Showing the
 * full 6-row palette in every mode keeps the legend honest about what
 * colors the canvas can paint.
 *
 * Reads from EdgeStyles.ts so a new edge kind (added to `EDGE_KIND_META`)
 * cannot drift between renderer and legend.
 *
 * The `data-legend-mode` attribute still reads `tree` for both flat modes
 * vs `clusters` for cluster mode (kept for backwards-compat with existing
 * E2E selectors that distinguish the two surfaces).
 *
 * Collapsible (default expanded). Collapse state persists in
 * `useViewStore.legendCollapsed` so a reload remembers the user's choice.
 */
import { useViewStore } from "@/lib/state/view-store";
import { useSelectionStore } from "@/lib/state/selection-store";
import { EDGE_KIND_META } from "./EdgeStyles";

export function EdgeLegend() {
  const collapsed = useViewStore((s) => s.legendCollapsed);
  const setCollapsed = useViewStore((s) => s.setLegendCollapsed);
  const graphLayout = useViewStore((s) => s.graphLayout);
  const detailPanelOpen = useSelectionStore((s) => s.detailPanelOpen);
  const isFlatMode = graphLayout === "tree" || graphLayout === "dendrogram";
  const panelOpen = detailPanelOpen;

  // Single row shape for every mode. The per-kind testIdSuffix mirrors the
  // EdgeKind values so existing `edge-legend-item-${kind}` selectors keep
  // working — and now resolve in flat modes too (was previously
  // `hierarchy`/`reference` only).
  const rows = EDGE_KIND_META.map((m) => ({
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
