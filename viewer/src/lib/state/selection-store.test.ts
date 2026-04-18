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
});
