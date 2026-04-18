import { create } from "zustand";
import type { FileKind } from "@/lib/graph/types";

const ALL_KINDS: FileKind[] = ["xml", "yaml", "json", "ini"];

interface FilterState {
  kinds: Set<FileKind>;
  hideTests: boolean;
  folder: string | null;
  searchQuery: string;
  toggleKind: (k: FileKind) => void;
  setHideTests: (v: boolean) => void;
  setFolder: (f: string | null) => void;
  setSearchQuery: (q: string) => void;
  reset: () => void;
}

export const useFilterStore = create<FilterState>((set) => ({
  kinds: new Set(ALL_KINDS),
  hideTests: true, // default ON per plan
  folder: null,
  searchQuery: "",
  toggleKind: (k) =>
    set((s) => {
      const next = new Set(s.kinds);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return { kinds: next };
    }),
  setHideTests: (v) => set({ hideTests: v }),
  setFolder: (f) => set({ folder: f }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  reset: () =>
    set({
      kinds: new Set(ALL_KINDS),
      hideTests: true,
      folder: null,
      searchQuery: "",
    }),
}));
