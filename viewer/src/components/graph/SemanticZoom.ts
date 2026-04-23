/**
 * Semantic-zoom mode constants + pure function to pick the mode from a
 * React Flow viewport zoom.
 *
 * Modes:
 *   - "overview" (zoom < Z_OVERVIEW_MAX): clusters as solid tiles with
 *     aggregated-edge counts; file nodes hidden even within expanded clusters.
 *   - "mid"      (Z_OVERVIEW_MAX ≤ zoom < Z_DETAIL_MIN): cluster outline
 *     visible + file nodes render as ghost (opacity-reduced) tiles.
 *   - "detail"   (zoom ≥ Z_DETAIL_MIN): full detail, file kind colors,
 *     parameter info in tooltips, edge labels.
 */

export type ZoomMode = "overview" | "mid" | "detail";

export const Z_OVERVIEW_MAX = 0.5;
export const Z_DETAIL_MIN = 1.0;

export function zoomModeFor(viewportZoom: number): ZoomMode {
  if (viewportZoom < Z_OVERVIEW_MAX) return "overview";
  if (viewportZoom < Z_DETAIL_MIN) return "mid";
  return "detail";
}
