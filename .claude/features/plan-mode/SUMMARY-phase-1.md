# Summary: plan-mode Phase 1 (PR-A of 3)

**Completed:** 2026-04-23 | **Branch:** feat/plan-mode | **PR:** [see STATUS.md]

**Status:** Phase 1 merged — Phase 2 and Phase 3 still to come on the same branch.

---

## What Was Built

Phase 1 delivers the identity-passthrough plumbing for Plan Mode: data types, ID minting helpers, a snapshot stripper, a pure composer (`composePlanGraph`), a Zustand store with custom per-key localStorage persistence, and a 4-line selector insertion in `GraphCanvas.tsx` that wires the composer into the graph read-path. By design, the viewer looks and behaves identically to the pre-plan-mode baseline when no plan is active. No new UI chrome ships in Phase 1; Phase 2 adds the visible toggle, edit panel, and plans list.

---

## Commits (oldest to newest)

| SHA | Message | Summary |
|-----|---------|---------|
| `a3742fb` | feat(viewer): plan-mode types, ID minter, snapshot stripper, composer | Adds plan-mode-types.ts, plan-ids.ts, plan-snapshot.ts, plan-overlay.ts all pure functions; 100% Vitest-covered. |
| `cb04f44` | feat(viewer): plan-mode-store with custom per-key localStorage persistence | Adds the sixth Zustand slice with hydration, quota-safe per-key writes, and a rollback mechanism. |
| `cb28b88` | feat(viewer): wire composePlanGraph into GraphCanvas read path | 4-line useMemo selector insertion in GraphCanvas.tsx; composedGraph replaces graph as the applyFilters dep. |
| `96531ae` | test(viewer): Phase 1 plan-mode headless-invariant Playwright spec | New plan-mode-headless-invariant.spec.ts flips the store toggle via window.__vivaPlanModeStore and asserts DOM-level node/edge counts and IDs are identical pre- and post-toggle. |
| `2b3b2fa` | chore: gitignore stray test artifacts + STATUS update for plan-mode phase 1 | Adds Playwright .last-run.json glob to .gitignore; updates STATUS.md. |

---

## Files Changed

| Component | File | Change |
|-----------|------|--------|
| viewer (types) | viewer/src/lib/state/plan-mode-types.ts | NEW |
| viewer (graph) | viewer/src/lib/graph/plan-ids.ts | NEW |
| viewer (graph) | viewer/src/lib/graph/plan-snapshot.ts | NEW |
| viewer (graph) | viewer/src/lib/graph/plan-overlay.ts | NEW |
| viewer (state) | viewer/src/lib/state/plan-mode-store.ts | NEW |
| viewer (component) | viewer/src/components/graph/GraphCanvas.tsx | MODIFIED (+11 / -2) |
| viewer (test) | viewer/src/lib/graph/plan-ids.test.ts | NEW |
| viewer (test) | viewer/src/lib/graph/plan-snapshot.test.ts | NEW |
| viewer (test) | viewer/src/lib/graph/plan-overlay.test.ts | NEW |
| viewer (test) | viewer/src/lib/state/plan-mode-store.test.ts | NEW |
| viewer (E2E) | viewer/e2e/plan-mode-headless-invariant.spec.ts | NEW |
| viewer (config) | viewer/eslint.config.js | MODIFIED |
| config | .gitignore | MODIFIED |
| pipeline | .claude/pipeline/STATUS.md | MODIFIED |

---

## Tests

- Crawler (pytest): 120 passing (unchanged)
- Viewer (Vitest): 318 passing (257 pre-existing + 61 new)
- E2E (Playwright): 95 passing (94 pre-existing + 1 new headless invariant)
- Build: pass | Lint: clean | Typecheck: clean

---

## Identity-Passthrough Invariant: Three Independent Proofs

| Proof | Method | Result |
|-------|--------|--------|
| 1. Reference equality (Vitest) | plan-overlay.test.ts: expect(out!.graph).toBe(live) across 4 variants | PASS (17 tests) |
| 2. All 94 pre-existing Playwright specs unchanged | Full npx playwright test run | PASS 94/94 pre-existing + 1 new = 95/95 |
| 3. New headless invariant spec | plan-mode-headless-invariant.spec.ts toggles planModeEnabled via window.__vivaPlanModeStore; asserts nodeCount, edgeCount, nodeIds[], edgeIds[] identical | PASS |

---

## Key Decisions

1. **Composer identity-passthrough by reference equality.** When no plan is active, composePlanGraph returns the SAME graph object reference. Keeps applyFilters useMemo deps stable. Locked by expect(out.graph).toBe(live).

2. **Custom per-key localStorage writer over zustand persist middleware.** Per-key approach isolates each plan so a too-big plan cannot corrupt the rest. Locked per plan.md §1.6.

3. **Snapshot stripper ships in Phase 1.** createPlan() strips params at creation time to keep per-plan writes within quota; locks the persistence shape early.

4. **Tombstones as flag sets, not graph removals.** Live node remains in graph.files; composePlanGraph returns tombstonedNodeIds: Set<string>. Layout engines stay ignorant.

5. **Notes are out-of-band.** noteByTargetId: Map returned separately; not embedded in Graph. Keeps graph.json schema unchanged.

6. **Single branch + stacked PRs.** PR-A / PR-B / PR-C all land on feat/plan-mode, rebased after each prior merge.

---

## Deferred Items

| Item | Why deferred | Where |
|------|-------------|-------|
| PlanModeToggle.tsx | Invisible in Phase 1 by design | plan.md §2.H |
| Node/edge visual states | Phase 2 component work | plan.md §2.A-2.D |
| Edit panel, plans list panel | Phase 2 chrome | plan.md §2.E-2.G |
| applyFilters bypass (2.J) | Phase 2 | plan.md §2.J |
| Drift detection + drift banner | Phase 3 | plan.md §3.A-3.D |
| Import/export (.plan.json) | Phase 3 | plan.md §3.E-3.F |
| Storage health warning surface | Phase 3 | plan.md §3.G |

---

## Retrospective

### Worked Well

- TDD on the riskiest surface (localStorage persistence) caught two edge cases pre-implementation: orphan-key cleanup on a failed list write, and the cleanOrder filter step during hydration.
- Identity-passthrough proven three ways before PR made the guarantee airtight for reviewers.
- Cross-store boundary test prevented an easy-to-miss violation.
- Custom per-key writer is cleanly encapsulated; Phase 3 storage health surface will be a targeted extension, not a rewrite.

### Went Wrong

- ESLint no-console rule was a late discovery. Intentional console.warn calls in plan-mode-store.ts required an unplanned eslint.config.js allowlist addition. Lesson: pre-check no-console scope before writing intentional console.warn/console.error in new modules.
- Visual review gate ambiguity cost documentation time. GraphCanvas.tsx mechanically triggers the gate but Phase 1 has zero visual delta. Plan §6 anticipated this, but it still required reasoning + visual-review.md population. Lesson: Phase 2 gate WILL trigger; budget +1 to +2 visual-review iteration cycles.
- window.__vivaPlanModeStore is exposed unconditionally rather than test-build-only as plan §8 suggested. Low-risk for an offline local tool; noted for Phase 2 review.

### Process

- Pipeline flow: smooth. Research to Plan to Implement to Test in one pass; no abort or diagnose cycles.
- Task granularity: right. A-H stream breakdown mapped closely to actual commits.
- Estimate accuracy: plan §10 estimated ~1 week; actual aligned. Persistence was the slowest task as predicted.
- Agent delegation: frontend-agent (implementation), test-agent (full suite + visual-review.md), finalize-agent (sweep + SUMMARY + PR).

---

## Phase 2 and Phase 3 Context

See plan.md §§3-4 for full task breakdowns. Key reminders for the Phase 2 execute-agent:

- Visual review gate is TRIGGERED and mandatory. Budget +30% for iteration cycles.
- Task 2.J (applyFilters bypass) touches viewer/src/lib/filters/predicates.ts.
- Four node-component changes (FileNode, TreeFileNode, ClusterNode, TreeFolderNode) must land in the same commit per polish-batch-1 lesson.
- Phase 3 diffGraphs is purely algorithmic; fully Vitest-coverable before any UI lands.
