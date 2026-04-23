/**
 * Toggle for "auto-open detail panel on tile click" (view-store setting).
 *
 * Mounted by ViewModeBar inside the graph-mode toolbar (only visible when
 * the user is in graph view; folders/table modes don't have a tile-click
 * affordance to gate). Persists the setting via view-store / localStorage —
 * the user's preference survives a refresh.
 *
 * UX intent: when the toolbar pill is "filled" (active), clicking a tile
 * opens the FileDetailPanel (historical default). When "outlined" (inactive),
 * clicking a tile selects + lights cross-ref edges WITHOUT opening the
 * panel — useful for scanning/tracing edges with the focus-revealed
 * palette without losing right-side real estate.
 *
 * Toggling OFF while the panel is currently open does NOT auto-close it
 * (the user can close manually with × or Esc) — only future clicks are
 * gated. Toggling ON does not auto-open anything either; the next click
 * resumes the historical behavior.
 *
 * Test ids follow the existing toolbar convention so Playwright selectors
 * stay regular: `detail-panel-toggle` for the button itself, plus the
 * aria-pressed attribute conveying state.
 */
import { useViewStore } from "@/lib/state/view-store";

export function DetailPanelToggle() {
  const autoOpenDetailPanel = useViewStore((s) => s.autoOpenDetailPanel);
  const setAutoOpenDetailPanel = useViewStore((s) => s.setAutoOpenDetailPanel);

  const label = autoOpenDetailPanel
    ? "Auto-open detail panel on click (on)"
    : "Auto-open detail panel on click (off)";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={autoOpenDetailPanel}
      aria-label={label}
      title={label}
      onClick={() => setAutoOpenDetailPanel(!autoOpenDetailPanel)}
      data-testid="detail-panel-toggle"
      data-state={autoOpenDetailPanel ? "on" : "off"}
      className={`flex items-center gap-1.5 rounded px-2 py-1 font-mono text-xs ${
        autoOpenDetailPanel
          ? "bg-neutral-800 text-neutral-100"
          : "text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200"
      }`}
    >
      {/* Inline SVG: a small panel-on-the-right icon. Filled rect when on,
          outlined when off — gives an at-a-glance affordance without
          requiring an icon library. aria-hidden because the button has its
          own aria-label / role=switch. */}
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        width="12"
        height="12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" />
        <line x1="10" y1="2.5" x2="10" y2="13.5" />
        {autoOpenDetailPanel ? (
          <rect x="10.5" y="3" width="3.5" height="10" fill="currentColor" />
        ) : null}
      </svg>
      <span>panel</span>
    </button>
  );
}
