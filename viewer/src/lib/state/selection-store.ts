import { create } from "zustand";

interface SelectionState {
  selectedFileId: string | null;
  selectedParamKey: string | null;
  /**
   * Currently hovered node id (file OR cluster path). Drives the focus+context
   * dimming of cross-reference edges in flat (dendrogram/tree) modes — when a
   * node is hovered, edges touching it stay full-opacity while every other
   * cross-ref edge dims to 0.15 so the user can trace what THIS node connects
   * to without the criss-cross noise.
   *
   * Cluster mode does not consume this value (its dense info-rich palette is
   * intentionally untouched), but the field still updates from any node-hover
   * event because the React Flow handlers are mode-agnostic — cheap and keeps
   * the store flat.
   *
   * Independent from `selectedFileId` so that a user can BOTH select a file
   * (opens the detail panel) AND scrub their mouse over neighboring nodes to
   * compare connection patterns. Selection counts as "focused" for the
   * dimming logic, so hovering nothing while a file is selected still lights
   * up the selected file's edges.
   */
  hoveredNodeId: string | null;
  /**
   * Whether the FileDetailPanel is visible. Decoupled from `selectedFileId`
   * so a click can update selection (which drives the focus-revealed
   * cross-ref palette + selection ring) without forcing the side panel
   * open. Controlled by the view-store `autoOpenDetailPanel` setting at the
   * call site (GraphCanvas) — selection-store itself is dumb about the
   * preference; it just provides the open/close actions.
   *
   * Defaults to false. Becomes true when GraphCanvas opens it explicitly,
   * the SearchPalette navigates to a file, or the toolbar "show panel"
   * action runs. Becomes false when the panel close button fires, when Esc
   * is pressed, or when `clear()` is called.
   */
  detailPanelOpen: boolean;
  selectFile: (id: string | null) => void;
  selectParam: (key: string | null) => void;
  /** Set the hovered node id, or clear with null. */
  hoverNode: (id: string | null) => void;
  /** Show the FileDetailPanel. No-op selection (caller sets that). */
  openDetailPanel: () => void;
  /** Hide the FileDetailPanel. Leaves selection alone. */
  closeDetailPanel: () => void;
  clear: () => void;
}

export const useSelectionStore = create<SelectionState>((set) => ({
  selectedFileId: null,
  selectedParamKey: null,
  hoveredNodeId: null,
  detailPanelOpen: false,
  selectFile: (id) => set({ selectedFileId: id, selectedParamKey: null }),
  selectParam: (key) => set({ selectedParamKey: key }),
  hoverNode: (id) => set({ hoveredNodeId: id }),
  openDetailPanel: () => set({ detailPanelOpen: true }),
  closeDetailPanel: () => set({ detailPanelOpen: false }),
  clear: () =>
    set({
      selectedFileId: null,
      selectedParamKey: null,
      hoveredNodeId: null,
      detailPanelOpen: false,
    }),
}));
