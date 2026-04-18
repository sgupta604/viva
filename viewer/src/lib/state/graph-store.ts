import { create } from "zustand";
import type { Graph } from "@/lib/graph/types";

type Status = "idle" | "loading" | "ready" | "error";

interface GraphState {
  graph: Graph | null;
  status: Status;
  error: string | null;
  setGraph: (g: Graph) => void;
  setStatus: (s: Status) => void;
  setError: (e: string | null) => void;
}

export const useGraphStore = create<GraphState>((set) => ({
  graph: null,
  status: "idle",
  error: null,
  setGraph: (g) => set({ graph: g, error: null }),
  setStatus: (s) => set({ status: s }),
  setError: (e) => set({ error: e }),
}));
