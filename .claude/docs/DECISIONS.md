# Locked Design Decisions

Append-only log of design decisions made for **future** work — captured here so they survive across machines, sessions, and contributors. Anything not yet implemented but already decided lives here. Once implemented, the decision migrates into code/specs and the entry stays for historical context.

Format per entry: short title, date locked, decision, why, how to apply.

---

## 2026-04-20 — Viewer state: Zustand with modular store split

**Decision.** Use Zustand for viewer state. When state is introduced or refactored, structure as **modular stores**, not one big store. Two known stores:

- `liveGraphStore` — read-only state derived from parsed `graph.json` (current behavior)
- `planModeStore` — sandbox state for Plan Mode edits (future feature, not yet built)

Even though only the live graph exists today, set up the modular structure with `liveGraphStore` first so the future `planModeStore` slots in cleanly without a state-layer rewrite.

**Why.** Plan Mode is on the roadmap and forks the data model into "truth" + "what-if". Separating stores from day one keeps the eventual addition additive instead of invasive — explicitly avoids a refactor when Plan Mode lands.

**How to apply.** Any viewer feature that touches state must use Zustand and respect the store boundary. Don't put plan-mode-shaped state into `liveGraphStore` even when it's the only store that exists.

---

## 2026-04-20 — Plan Mode data model: snapshot + git-style diff reconciliation

**Decision.** Plan Mode (future feature) uses a snapshot data model, not a delta. When a user saves a plan, persist a full copy of the live graph as `base_graph` plus the user's `edits` (additions, deletions, connections, notes) layered on top.

```
Plan {
  name: string
  created_at: timestamp
  base_graph: <full snapshot of live graph at save time>
  edits: <additions, deletions, connections, notes>
}
```

When reopened, diff `base_graph` against the current live graph and surface drift (added/deleted nodes, new edges, etc.) to the user. They choose: update the plan, archive it, or dismiss the warning. This same machinery makes the future side-by-side current-vs-planned diff view feasible.

**Why.** A delta-only model can't reconstruct what the world looked like when the plan was designed if the underlying code drifts. Saving the base enables real reconciliation rather than silent invalidation. User locked in this answer during the Plan Mode design discussion — do not re-litigate.

**How to apply.** When `/research plan-mode` runs, this is the answer to the data-model question. Storage, diff, and reconciliation design should work backwards from this shape. Plan files are JSON artifacts (no DB in v1).

---

## 2026-04-22 — elkjs promoted from skeleton to primary layout engine (tree mode)

**Decision.** `elkjs` (already bundled, sitting unused as `computeElkLayout` skeleton in `viewer/src/lib/graph/layout.worker.ts`) is now the production layout engine for the new tree mode. Algorithm: `mrtree` with `elk.direction = RIGHT`. Cluster mode keeps its synchronous recursive grid-pack in `cluster-layout.ts`.

**Why.** The 3k-node grid-pack passed the FPS gate only because it was O(n) trivial math, not because it produced a real hierarchical layout. A true dendrogram needs proper hierarchical placement. `mrtree` was chosen over `layered` for the dendrogram aesthetic the user's reference image shows — fanned-out children, orthogonal connectors, no Sugiyama-style horizontal layering. `mrtree` also ignores non-tree edges for layout purposes, which is the correct behavior because we draw config edges (`include`, `ref`, `xsd`, `logical-id`, `d-aggregate`) as overlays on top of the structural backbone.

**How to apply.** New tree-shape features call `computeTreeLayout(graph, expanded)` from `lib/graph/tree-layout.ts`. The worker path runs through `new Worker(new URL("./layout.worker.ts", ...), { type: "module" })`; the same module's `computeElkLayout` export is the main-thread fallback for jsdom tests. LRU cache size 8, keyed by `(graphHash, expandedHash)` — pan/zoom never re-runs layout. If a future mode wants Sugiyama-style compact width, pass `{ algorithm: "layered" }` to `computeElkLayout`; both paths are wired.

---

## 2026-04-22 — Tree mode is the default; cluster (box-inside-box) is a toggle

**Decision.** Graph view default-on-load is the new horizontal `mrtree` dendrogram. The existing cluster-box layout (`computeClusterLayout`) becomes an opt-in toggle in `ViewModeBar`'s graph-mode-only sub-toggle. Persisted per browser via `localStorage["viva.viewStore.graphLayout"]`.

**Why.** Direct user feedback during research: "the box inside box is nice but set it as a toggle." A horizontal tree communicates parent/child relationships at first glance more legibly than nested boxes do at 3k-file scale. Cluster mode is preserved (not deleted) because the user explicitly likes it for inspection of a focused subtree.

**How to apply.** Any new viewer feature that needs to know which layout is active reads `useViewStore.graphLayout` (`"tree" | "clusters"`). New visual features should be tested in BOTH modes — they share node atoms (`FileNode`, `ClusterNode`) and the same `hierarchyStore.expanded` set, so toggling between them must not reset state. Default for new installs: tree.
