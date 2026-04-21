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
