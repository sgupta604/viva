import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DetailPanelToggle } from "./DetailPanelToggle";
import { useViewStore, __VIEW_STORE_INTERNALS } from "@/lib/state/view-store";

const { AUTO_OPEN_DETAIL_PANEL_STORAGE_KEY } = __VIEW_STORE_INTERNALS;

describe("DetailPanelToggle", () => {
  beforeEach(() => {
    // Reset to default-on between tests so each case starts from the
    // historical baseline.
    useViewStore.setState({ autoOpenDetailPanel: true });
    window.localStorage.removeItem(AUTO_OPEN_DETAIL_PANEL_STORAGE_KEY);
  });

  it("renders aria-checked=true when autoOpenDetailPanel is on (default)", () => {
    render(<DetailPanelToggle />);
    const btn = screen.getByTestId("detail-panel-toggle");
    expect(btn).toHaveAttribute("aria-checked", "true");
    expect(btn).toHaveAttribute("data-state", "on");
  });

  it("renders aria-checked=false when autoOpenDetailPanel is off", () => {
    useViewStore.setState({ autoOpenDetailPanel: false });
    render(<DetailPanelToggle />);
    const btn = screen.getByTestId("detail-panel-toggle");
    expect(btn).toHaveAttribute("aria-checked", "false");
    expect(btn).toHaveAttribute("data-state", "off");
  });

  it("clicking flips the view-store flag and persists the new value", () => {
    render(<DetailPanelToggle />);
    const btn = screen.getByTestId("detail-panel-toggle");

    // on → off
    fireEvent.click(btn);
    expect(useViewStore.getState().autoOpenDetailPanel).toBe(false);
    expect(
      window.localStorage.getItem(AUTO_OPEN_DETAIL_PANEL_STORAGE_KEY),
    ).toBe("false");

    // off → on
    fireEvent.click(btn);
    expect(useViewStore.getState().autoOpenDetailPanel).toBe(true);
    expect(
      window.localStorage.getItem(AUTO_OPEN_DETAIL_PANEL_STORAGE_KEY),
    ).toBe("true");
  });

  it("exposes a role=switch for assistive tech", () => {
    render(<DetailPanelToggle />);
    expect(screen.getByRole("switch")).toBeInTheDocument();
  });
});
