import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EdgeLegend } from "./EdgeLegend";
import { EDGE_KIND_META } from "./EdgeStyles";
import { useViewStore } from "@/lib/state/view-store";
import { useSelectionStore } from "@/lib/state/selection-store";

describe("EdgeLegend — clusters mode (full 6-row palette)", () => {
  beforeEach(() => {
    // Force-expanded baseline + clusters mode + clear localStorage so
    // persistence tests are independent.
    useViewStore.setState({ legendCollapsed: false, graphLayout: "clusters" });
    window.localStorage.removeItem("viva.viewStore.legendCollapsed");
  });

  it("renders one row per EDGE_KIND_META entry when expanded", () => {
    render(<EdgeLegend />);
    for (const m of EDGE_KIND_META) {
      expect(screen.getByTestId(`edge-legend-item-${m.kind}`)).toBeInTheDocument();
    }
  });

  it("displays the human-readable label for every kind", () => {
    render(<EdgeLegend />);
    for (const m of EDGE_KIND_META) {
      const row = screen.getByTestId(`edge-legend-item-${m.kind}`);
      expect(row.textContent).toContain(m.label);
    }
  });

  it("collapses when toggle is clicked, hiding the list", () => {
    render(<EdgeLegend />);
    expect(screen.getByTestId("edge-legend-list")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("edge-legend-toggle"));
    expect(screen.queryByTestId("edge-legend-list")).not.toBeInTheDocument();
  });

  it("persists collapsed state to localStorage", () => {
    render(<EdgeLegend />);
    fireEvent.click(screen.getByTestId("edge-legend-toggle"));
    expect(window.localStorage.getItem("viva.viewStore.legendCollapsed")).toBe(
      "true",
    );
  });

  it("toggle button advertises its state via aria-expanded", () => {
    render(<EdgeLegend />);
    const btn = screen.getByTestId("edge-legend-toggle");
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(btn);
    expect(btn.getAttribute("aria-expanded")).toBe("false");
  });

  it("declares clusters mode via data-legend-mode", () => {
    render(<EdgeLegend />);
    expect(
      screen.getByTestId("edge-legend").getAttribute("data-legend-mode"),
    ).toBe("clusters");
  });
});

describe("EdgeLegend — flat modes (full 6-row palette)", () => {
  beforeEach(() => {
    window.localStorage.removeItem("viva.viewStore.legendCollapsed");
  });

  // Both flat modes used to render a compact 2-row palette (hierarchy +
  // reference). User feedback 2026-04-22 (follow-up): the focus-revealed
  // per-kind colors that light up on hover had no key in the legend, so
  // every flat mode now mirrors the 6-row cluster palette.
  for (const layout of ["tree", "dendrogram"] as const) {
    describe(`graphLayout="${layout}"`, () => {
      beforeEach(() => {
        useViewStore.setState({ legendCollapsed: false, graphLayout: layout });
      });

      it("renders one row per EDGE_KIND_META entry", () => {
        render(<EdgeLegend />);
        for (const m of EDGE_KIND_META) {
          expect(
            screen.getByTestId(`edge-legend-item-${m.kind}`),
          ).toBeInTheDocument();
        }
      });

      it("displays the human-readable label for every kind", () => {
        render(<EdgeLegend />);
        for (const m of EDGE_KIND_META) {
          const li = screen.getByTestId(`edge-legend-item-${m.kind}`);
          expect(li.textContent).toContain(m.label);
        }
      });

      it("declares tree mode via data-legend-mode (flat-mode marker)", () => {
        render(<EdgeLegend />);
        expect(
          screen.getByTestId("edge-legend").getAttribute("data-legend-mode"),
        ).toBe("tree");
      });
    });
  }
});

describe("EdgeLegend — positioning", () => {
  beforeEach(() => {
    useViewStore.setState({ legendCollapsed: false, graphLayout: "tree" });
    useSelectionStore.setState({
      selectedFileId: null,
      selectedParamKey: null,
      hoveredNodeId: null,
      detailPanelOpen: false,
    });
  });

  it("anchors top-right at 12px when no detail panel is open", () => {
    render(<EdgeLegend />);
    const chip = screen.getByTestId("edge-legend");
    // The position is now an inline `right` style so it can swap to clear
    // the detail panel; the top-3 class still locks the vertical anchor.
    expect(chip.className).toMatch(/\btop-3\b/);
    expect(chip.className).not.toMatch(/\bbottom-3\b/);
    expect(chip.className).not.toMatch(/\bleft-3\b/);
    expect((chip as HTMLElement).style.right).toBe("12px");
    expect(chip.getAttribute("data-panel-open")).toBe("false");
  });

  it("shifts left to clear the 400px detail panel when the panel is open (Bug #7)", () => {
    // Simulate the panel being OPEN — the FileDetailPanel renders
    // bottom-right top:96px with width 400px and would otherwise cover
    // the legend at typical viewport widths. The legend reads
    // detailPanelOpen and shifts to right=416 (panel + 16px breathing
    // margin) so both stay visible without overlap.
    useSelectionStore.setState({
      selectedFileId: "some-file",
      detailPanelOpen: true,
    });
    render(<EdgeLegend />);
    const chip = screen.getByTestId("edge-legend");
    expect((chip as HTMLElement).style.right).toBe("416px");
    expect(chip.getAttribute("data-panel-open")).toBe("true");
  });

  // Bug #1 (visual-review 2026-04-23): with auto-open-panel toggled OFF,
  // a click sets selectedFileId but leaves detailPanelOpen=false — the
  // legend MUST stay put because no panel is rendered to clear.
  it("stays put when a file is selected but the panel is closed (auto-open OFF case)", () => {
    useSelectionStore.setState({
      selectedFileId: "some-file",
      detailPanelOpen: false,
    });
    render(<EdgeLegend />);
    const chip = screen.getByTestId("edge-legend");
    expect((chip as HTMLElement).style.right).toBe("12px");
    expect(chip.getAttribute("data-panel-open")).toBe("false");
  });

  // Bug #2 (visual-review 2026-04-23): after the user closes the panel
  // via its X button, detailPanelOpen flips back to false even though
  // selectedFileId is still set. The legend MUST snap back to the
  // default 12px — the symptom that motivated this regression test was
  // the legend visibly sticking out into empty space with no panel.
  it("snaps back to 12px when the panel is manually closed while selection persists (manual-close case)", () => {
    useSelectionStore.setState({
      selectedFileId: "some-file",
      detailPanelOpen: false,
    });
    render(<EdgeLegend />);
    const chip = screen.getByTestId("edge-legend");
    expect((chip as HTMLElement).style.right).toBe("12px");
  });
});
