/**
 * Hierarchy store — expand/collapse state for cluster nodes in the graph view.
 *
 * Part of the Zustand modular-stores boundary per .claude/docs/DECISIONS.md
 * (2026-04-20). Explicitly does NOT import from filter-store, graph-store,
 * view-store, or selection-store — consumers compose at the component level.
 *
 * Persistence: sessionStorage (via Zustand `persist` middleware). Survives a
 * page refresh while a browser restart gives a clean state — matches the
 * "refresh-during-debugging friendly, not long-lived" trade-off from the
 * research doc (Q10).
 *
 * Serialization detail: Zustand's persist middleware JSON-stringifies state.
 * A raw `Set<string>` doesn't round-trip through JSON so we persist a sorted
 * string[] and rehydrate it into a Set in the merge step.
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/** sessionStorage key. Exported so tests can clear it directly. */
export const HIERARCHY_STORAGE_KEY = "viva:hierarchy:v1";

interface HierarchyState {
  /** The set of currently-expanded cluster paths. */
  expanded: Set<string>;
  /** Expand a single cluster. No-op if already expanded. */
  expand: (path: string) => void;
  /** Collapse a single cluster. No-op if not expanded. */
  collapse: (path: string) => void;
  /**
   * Expand the full ancestor chain leading to `path` (inclusive), so the
   * target cluster and all of its parents are open. Used by "Jump to folder"
   * (FilterBar) and by expand-to-file navigation.
   */
  expandToPath: (path: string) => void;
  /** Clear all expansion state. Used by the "(all)" filter option. */
  collapseAll: () => void;
  /** Selector: whether a given cluster path is expanded. */
  isExpanded: (path: string) => boolean;
  /** Selector: a snapshot copy of the expanded set. */
  expandedSet: () => Set<string>;
}

/**
 * Return every prefix of a POSIX path, top-to-bottom. Ignores an empty path.
 *
 *   ancestors("a/b/c") => ["a", "a/b", "a/b/c"]
 *   ancestors("a")     => ["a"]
 *   ancestors("")      => []
 */
function ancestors(path: string): string[] {
  if (!path) return [];
  const parts = path.split("/").filter(Boolean);
  const out: string[] = [];
  for (let i = 1; i <= parts.length; i += 1) {
    out.push(parts.slice(0, i).join("/"));
  }
  return out;
}

export const useHierarchyStore = create<HierarchyState>()(
  persist(
    (set, get) => ({
      expanded: new Set<string>(),

      expand: (path) => {
        if (!path) return;
        const cur = get().expanded;
        if (cur.has(path)) return;
        const next = new Set(cur);
        next.add(path);
        set({ expanded: next });
      },

      collapse: (path) => {
        const cur = get().expanded;
        if (!cur.has(path)) return;
        const next = new Set(cur);
        next.delete(path);
        set({ expanded: next });
      },

      expandToPath: (path) => {
        if (!path) return;
        const next = new Set(get().expanded);
        for (const a of ancestors(path)) next.add(a);
        set({ expanded: next });
      },

      collapseAll: () => {
        if (get().expanded.size === 0) return;
        set({ expanded: new Set<string>() });
      },

      isExpanded: (path) => get().expanded.has(path),
      expandedSet: () => new Set(get().expanded),
    }),
    {
      name: HIERARCHY_STORAGE_KEY,
      // In vitest/jsdom sessionStorage exists; createJSONStorage handles the
      // "no-storage" environment (e.g. SSR) gracefully.
      storage: createJSONStorage(() => {
        if (typeof sessionStorage !== "undefined") return sessionStorage;
        // Fallback no-op storage so tests in odd environments don't blow up.
        const noop: Storage = {
          length: 0,
          key: () => null,
          getItem: () => null,
          setItem: () => undefined,
          removeItem: () => undefined,
          clear: () => undefined,
        };
        return noop;
      }),
      // Set <-> array round-trip for JSON persistence.
      partialize: (state) => ({ expanded: Array.from(state.expanded) }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as { expanded?: string[] } | undefined;
        return {
          ...currentState,
          expanded: new Set(persisted?.expanded ?? []),
        };
      },
    },
  ),
);
