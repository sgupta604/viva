import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EdgeLegend } from "./EdgeLegend";
import { EDGE_KIND_META, TREE_LEGEND_ROWS } from "./EdgeStyles";
import { useViewStore } from "@/lib/state/view-store";

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

describe("EdgeLegend — tree mode (compact 2-row palette)", () => {
  beforeEach(() => {
    useViewStore.setState({ legendCollapsed: false, graphLayout: "tree" });
    window.localStorage.removeItem("viva.viewStore.legendCollapsed");
  });

  it("renders exactly the two TREE_LEGEND_ROWS entries", () => {
    render(<EdgeLegend />);
    for (const row of TREE_LEGEND_ROWS) {
      expect(
        screen.getByTestId(`edge-legend-item-${row.bucket}`),
      ).toBeInTheDocument();
    }
    // No per-kind cluster rows should leak into tree mode.
    for (const m of EDGE_KIND_META) {
      expect(
        screen.queryByTestId(`edge-legend-item-${m.kind}`),
      ).not.toBeInTheDocument();
    }
  });

  it("displays the human-readable label for hierarchy + reference", () => {
    render(<EdgeLegend />);
    for (const row of TREE_LEGEND_ROWS) {
      const li = screen.getByTestId(`edge-legend-item-${row.bucket}`);
      expect(li.textContent).toContain(row.label);
    }
  });

  it("declares tree mode via data-legend-mode", () => {
    render(<EdgeLegend />);
    expect(
      screen.getByTestId("edge-legend").getAttribute("data-legend-mode"),
    ).toBe("tree");
  });
});

describe("EdgeLegend — positioning", () => {
  beforeEach(() => {
    useViewStore.setState({ legendCollapsed: false, graphLayout: "tree" });
  });

  it("anchors top-right (clears bottom-left React Flow Controls)", () => {
    render(<EdgeLegend />);
    const chip = screen.getByTestId("edge-legend");
    // The Tailwind class set is the source of truth for position; if a
    // future tweak moves the legend back to bottom-left it will land on
    // top of the fit-view button again, regressing user feedback
    // 2026-04-22. Lock the anchor here.
    expect(chip.className).toMatch(/\bright-3\b/);
    expect(chip.className).toMatch(/\btop-3\b/);
    expect(chip.className).not.toMatch(/\bbottom-3\b/);
    expect(chip.className).not.toMatch(/\bleft-3\b/);
  });
});
