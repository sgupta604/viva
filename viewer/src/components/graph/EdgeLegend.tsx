/**
 * Always-visible edge legend chip — bottom-left of the graph canvas, next
 * to React Flow's <Controls />. Reads kind/color/label from the single
 * `EDGE_KIND_META` source in `EdgeStyles.ts` so a new edge kind cannot
 * drift between renderer and legend (research §FR8 path B precondition).
 *
 * Collapsible (default expanded). Collapse state persists in
 * `useViewStore.legendCollapsed` so a reload remembers the user's choice.
 */
import { useViewStore } from "@/lib/state/view-store";
import { EDGE_KIND_META } from "./EdgeStyles";

export function EdgeLegend() {
  const collapsed = useViewStore((s) => s.legendCollapsed);
  const setCollapsed = useViewStore((s) => s.setLegendCollapsed);

  return (
    <div
      className="pointer-events-auto absolute bottom-3 left-3 z-20 rounded-md border border-neutral-700 bg-neutral-900/90 px-2 py-1.5 text-[11px] text-neutral-300 shadow-md backdrop-blur-sm"
      data-testid="edge-legend"
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
          {EDGE_KIND_META.map((m) => (
            <li
              key={m.kind}
              className="flex items-center gap-2 font-mono"
              data-testid={`edge-legend-item-${m.kind}`}
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
                  stroke={m.color}
                  strokeWidth={Math.max(1.5, m.strokeWidth)}
                  strokeDasharray={m.dasharray}
                />
              </svg>
              <span className="text-neutral-300">{m.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
