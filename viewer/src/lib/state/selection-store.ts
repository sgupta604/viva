import { create } from "zustand";

interface SelectionState {
  selectedFileId: string | null;
  selectedParamKey: string | null;
  selectFile: (id: string | null) => void;
  selectParam: (key: string | null) => void;
  clear: () => void;
}

export const useSelectionStore = create<SelectionState>((set) => ({
  selectedFileId: null,
  selectedParamKey: null,
  selectFile: (id) => set({ selectedFileId: id, selectedParamKey: null }),
  selectParam: (key) => set({ selectedParamKey: key }),
  clear: () => set({ selectedFileId: null, selectedParamKey: null }),
}));
