import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EdgeLegend } from "./EdgeLegend";
import { EDGE_KIND_META } from "./EdgeStyles";
import { useViewStore } from "@/lib/state/view-store";

describe("EdgeLegend", () => {
  beforeEach(() => {
    // Force-expanded baseline + clear localStorage so persistence tests are
    // independent.
    useViewStore.setState({ legendCollapsed: false });
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
});
