import { describe, it, expect, beforeEach } from "vitest";
import { useSelectionStore } from "./selection-store";

describe("selection store", () => {
  beforeEach(() => {
    useSelectionStore.getState().clear();
  });

  it("selecting a file clears param", () => {
    useSelectionStore.getState().selectParam("x");
    useSelectionStore.getState().selectFile("file-1");
    expect(useSelectionStore.getState().selectedFileId).toBe("file-1");
    expect(useSelectionStore.getState().selectedParamKey).toBeNull();
  });

  it("clear resets both", () => {
    useSelectionStore.getState().selectFile("a");
    useSelectionStore.getState().selectParam("b");
    useSelectionStore.getState().clear();
    const s = useSelectionStore.getState();
    expect(s.selectedFileId).toBeNull();
    expect(s.selectedParamKey).toBeNull();
  });

  it("hoverNode sets and clears the hovered id without disturbing selection", () => {
    useSelectionStore.getState().selectFile("file-1");
    useSelectionStore.getState().hoverNode("file-2");
    let s = useSelectionStore.getState();
    expect(s.selectedFileId).toBe("file-1");
    expect(s.hoveredNodeId).toBe("file-2");

    useSelectionStore.getState().hoverNode(null);
    s = useSelectionStore.getState();
    expect(s.selectedFileId).toBe("file-1");
    expect(s.hoveredNodeId).toBeNull();
  });

  it("clear also wipes hover state", () => {
    useSelectionStore.getState().selectFile("a");
    useSelectionStore.getState().hoverNode("b");
    useSelectionStore.getState().clear();
    const s = useSelectionStore.getState();
    expect(s.selectedFileId).toBeNull();
    expect(s.hoveredNodeId).toBeNull();
  });
});
