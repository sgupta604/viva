# Summary: large-codebase-viewer

**Completed:** 2026-04-22 | **Branch:** feat/large-codebase-viewer | **PR:** (see below)

## What Was Built

Hierarchical graph viewer for config codebases at 1k-3k file scale. The crawler gained five new explicit-pattern edge kinds (XSD schema references, .d/ drop-in directory aggregation, logical-ID cross-file linking, xi:fallback classification, generated-file detection); the graph schema bumped to v2 with a `clusters[]` top-level field and two new optional FileNode flags. The viewer replaced the flat dagre layout with compound cluster nodes (React Flow parentNode), added a `hierarchyStore` Zustand slice for expand/collapse with sessionStorage persistence, semantic zoom (overview/mid/detail CSS class switching), edge aggregation for collapsed cluster endpoints, NAVIGATE semantics on the folder filter, and a generated-file badge on FileNode. FPS p95 = 17.90 ms on a 3,000-file synthetic Playwright fixture, 46% below the 33 ms gate. 21 commits, all streams complete (F=7, C=6, V=10, I=6).

## Files Changed

| Component | File | Change |
|-----------|------|--------|
| docs | `docs/GRAPH-SCHEMA.md` | Schema v2 delta: ClusterNode, widened EdgeKind, attrs.order, generated/generatedFrom, unresolved prefix classification, version table, camelCase/snake_case key-reference table |
| crawler | `crawler/src/crawler/graph.py` | Add ClusterNode dataclass; FileNode.generated/generatedFrom; widen EdgeKind; Edge.attrs; bump version=2 |
| crawler | `crawler/src/crawler/emit.py` | Emit clusters[], version=2; camelCase at JSON boundary |
| crawler | `crawler/src/crawler/clusters.py` | NEW - pure build_clusters() from file paths + .d/ pairing |
| crawler | `crawler/src/crawler/templating.py` | NEW - manifest scanner; marks FileNode.generated on explicit listing only |
| crawler | `crawler/src/crawler/parsers/xml.py` | Capture xsi:schemaLocation/xsi:noNamespaceSchemaLocation; logical-ID attrs; xi:fallback sibling flag |
| crawler | `crawler/src/crawler/refs.py` | XSD resolver (path-relative then tail); .d/ synthetic edge emitter; logical-ID index with cardinality caps; xi:fallback prefix; ambiguous: prefix on tail collisions |
| crawler | `crawler/src/crawler/__init__.py` | Wire clusters + templating into crawl() pipeline |
| crawler | `crawler/src/crawler/__main__.py` | --logical-id-max-cardinality flag (default 20) |
| crawler-fixtures | `crawler/tests/fixtures/sample-xsd/` | NEW |
| crawler-fixtures | `crawler/tests/fixtures/sample-d-dir/` | NEW |
| crawler-fixtures | `crawler/tests/fixtures/sample-logical-id/` | NEW |
| crawler-fixtures | `crawler/tests/fixtures/sample-fallback/` | NEW |
| crawler-fixtures | `crawler/tests/fixtures/sample-templating/` | NEW |
| crawler-tests | `crawler/tests/test_clusters.py` | NEW |
| crawler-tests | `crawler/tests/test_refs_xsd.py` | NEW |
| crawler-tests | `crawler/tests/test_refs_d_aggregate.py` | NEW |
| crawler-tests | `crawler/tests/test_refs_logical_id.py` | NEW |
| crawler-tests | `crawler/tests/test_refs_fallback.py` | NEW |
| crawler-tests | `crawler/tests/test_templating.py` | NEW |
| crawler-tests | `crawler/tests/test_scale_synthetic.py` | NEW |
| crawler-tests | `crawler/tests/test_dogfood.py` | NEW |
| crawler-tests | `crawler/tests/test_integration.py` | Adapted to v2 schema |
| crawler-fixtures | `crawler/tests/fixtures/sample-module.expected.graph.json` | Regenerated for v2 |
| viewer-lib | `viewer/src/lib/graph/types.ts` | ClusterNode interface; widened EdgeKind; generated/generatedFrom; attrs on Edge |
| viewer-lib | `viewer/src/lib/graph/schema.ts` | zod v1+v2 discriminated union; v1 upgrade shim |
| viewer-lib | `viewer/src/lib/graph/cluster-layout.ts` | NEW - pure layout: (graph, expanded) -> positioned nodes; sync grid-pack |
| viewer-lib | `viewer/src/lib/graph/layout.worker.ts` | NEW - Web Worker skeleton wrapping elkjs (not on critical path) |
| viewer-lib | `viewer/src/lib/graph/layout.ts` | Replaced dagre; exports all dimension constants as single source of truth |
| viewer-lib | `viewer/src/lib/graph/aggregate-edges.ts` | NEW - pure edge aggregation by cluster pair; dominant-kind precedence |
| viewer-lib | `viewer/src/lib/graph/SemanticZoom.ts` | NEW - zoom threshold constants; viewport to zoom-mode pure selector |
| viewer-lib | `viewer/src/lib/state/hierarchy-store.ts` | NEW - Zustand slice with sessionStorage persist |
| viewer-lib | `viewer/src/lib/filters/predicates.ts` | Removed folder-based stripping; folder is NAVIGATE not HIDE |
| viewer-ui | `viewer/src/components/graph/ClusterNode.tsx` | NEW - compound node: header strip, toggle, child-count badge, .d/ variant |
| viewer-ui | `viewer/src/components/graph/GraphCanvas.tsx` | cluster nodeType; hierarchyStore wire; virtualization-by-omission; semantic zoom; auto-descend single-child-root useEffect; ReactFlowProvider internal |
| viewer-ui | `viewer/src/components/graph/FileNode.tsx` | generated badge + faded border variant |
| viewer-ui | `viewer/src/components/graph/EdgeStyles.ts` | NEW - styles for 6 edge kinds + aggregated edge renderer with count label + on-hover breakdown |
| viewer-ui | `viewer/src/components/graph/FolderGroup.tsx` | DELETED (dead code, superseded by ClusterNode) |
| viewer-ui | `viewer/src/components/filters/FilterBar.tsx` | Relabeled "Jump to folder"; dispatches expandToPath + fitBounds; (all) = collapseAll + fitView |
| viewer-ui | `viewer/src/components/views/FolderView.tsx` | Uses graph.clusters for tree display when present |
| viewer-e2e | `viewer/e2e/fixtures/large/generate.ts` | NEW - deterministic 3k-file graph.json synthesizer (20x15x10; 2 .d/ dirs; XSD + logical-id edges) |
| viewer-e2e | `viewer/e2e/global-setup.ts` | Stages large-synthetic fixture at test setup time |
| viewer-e2e | `viewer/e2e/fps-bench.spec.ts` | NEW - FPS bench: pan 2s over 3k fixture; gate p95 < 33 ms |
| viewer-e2e | `viewer/e2e/large-scale.spec.ts` | NEW - default-collapsed at 3k scale; expand-cluster; semantic-zoom transitions |
| viewer-e2e | `viewer/e2e/hierarchy.spec.ts` | NEW - expand/collapse; cross-cluster edge visibility; aggregated edge hover; sessionStorage persistence |
| viewer-e2e | `viewer/e2e/filters.spec.ts` | Rewritten 10 assertions for NAVIGATE semantics |
| viewer-e2e | `viewer/e2e/fixtures/graph.json` | Regenerated for v2 schema |

## Tests

- Crawler (pytest): 112 / 112 passing (11 integration, 4 scale/dogfood)
- Viewer (Vitest): 96 / 96 passing (new suites: hierarchy-store, schema, cluster-layout, ClusterNode, FileNode, EdgeStyles, SemanticZoom, aggregate-edges, large-fixture)
- E2E (Playwright): 36 / 36 passing (fps-bench, hierarchy, large-scale, filters, load, detail, keyboard)
- Build: pass (54 s; elkjs bundled locally; Monaco pre-existing)
- Lint: clean (crawler ruff; viewer source 0 new errors; 588 pre-existing in .vite/deps vendored)
- Typecheck: clean

## Key Decisions

All 13 research open questions resolved. Cross-reference to implementing commits:

| Q | Decision | Commit |
|---|----------|--------|
| Q1 React Flow vs Cytoscape | Keep React Flow; FPS gate is bail-out signal | 2d0ba2a |
| Q2 Layout algorithm | elkjs dep + Worker skeleton; sync grid-pack on critical path | bfe547c |
| Q3 First view on load | Top-level clusters collapsed; auto-descend 1 level if single-child root | c7c3945 |
| Q4 FPS measurement | Playwright bench in foundation (F.7), enabled at I.1 after V.4 | e061412 / 2d0ba2a |
| Q5 Content-driven vs path-driven | All rules content-driven; no path hardcoding | entire C-stream |
| Q6 3k fixture | Deterministic generator at test-setup; no committed output | 7da0e93 |
| Q7 Edge-count envelope | 600-4000 on ~1400-file codebase; smoke tests per kind | 2f2ae1b |
| Q8 Shell scripts / binaries | Non-goal; remain as unresolved string targets | explicit non-goal |
| Q9 Edge aggregation threshold | Always aggregate when both endpoints collapsed; per-kind on expand | b15e809 |
| Q10 hierarchyStore persistence | sessionStorage via Zustand persist middleware | 0cb60d1 |
| Q11 Folder filter | NAVIGATE (expandToPath + fitBounds); siblings stay | b15e809 |
| Q12 Crawler emits ClusterNode | Yes; contract-first from schema delta | 4c76ffd |
| Q13 .d/ vs folder rendering | ClusterNode.kind field drives renderer | 69823b0 / c7c3945 |

Additional non-obvious decisions made during implementation:

- **elkjs on non-critical path.** Sync grid-pack in cluster-layout.ts passes the FPS gate deterministically. computeElkLayout() is wired and validated by the build; promote to primary layout in v2.1 when aesthetics become the priority.
- **.xsd as kind="xml".** Adding "xsd" to the 4-enum FileKind literal cascades into schema.ts, Zod, and test fixtures on both sides. XSD files are first-class graph nodes via extension-driven dispatch; the xsd edge kind is what the graph cares about.
- **Logical-ID scope narrowed to model-id/scheme on non-declarer tags.** Raw id on non-declarer tags is too noisy in real-world XML (DOM anchors, inline ids). Narrower scope produces edges users can trust. Widening available via CLI flag in a follow-up.
- **GraphCanvas wraps ReactFlowProvider internally.** useOnViewportChange and useReactFlow are valid in its subtree and in FilterBar (via try/catch for non-provider contexts). No change to App.tsx required.

## Deviations from Plan

| Planned | Actual | Why |
|---------|--------|-----|
| layout.worker.ts drives GraphCanvas via elk on critical path | Skeleton only; sync grid-pack on critical path | FPS gate passed at 17.90 ms p95 without elk. Worker skeleton preserved for v2.1 aesthetic pass. Rewiring during this feature would have been higher-risk with no FPS benefit. |
| .xsd treated as new FileKind | kind="xml" via xml parser | New FileKind cascades into schema.ts / Zod / test fixtures across both sides. Kept FileKind a 4-enum; XSD is a first-class graph node via the extension-driven dispatcher. |
| V.2 as a distinct commit; V.3/V.4 as distinct commits | V.2 absorbed into F.6; V.3+V.4 merged (c7c3945) | cluster-layout.ts was architected as a pure function from day one - V.2 wire-through was the same contract. V.3/V.4 had tight coupling; landing them together kept E2E green throughout. |
| Logical-ID: id/model-id/scheme/name on declarer-tag whitelist | model-id and scheme on non-declarer tags; raw id excluded | id on non-declarer tags is too noisy in real-world XML. Narrower scope matches the "edges I can trust" principle from research Q3. Widenable by CLI flag. |

## Deferred Items / v2.1 Queue

- **Nested cluster rendering multi-level.** Expanded cluster shows childFiles only, not nested childClusters. Adequate for FPS gate fixture. Compound-node nesting in React Flow is the v2.1 path.
- **Heuristic glob-pattern ref matching.** The "replace-an-LLM" theme - filename-glob inference without a declared ID anchor. Explicit-patterns-only scope was deliberate; widen if the user determines declared-ID scope is insufficient.
- **XPointer fragment resolution.** xi:include with xpointer="..." slices specific nodes. File-level edge is emitted today; fragment resolution is a separate parsing layer.
- **Jinja2 templating introspection.** Only marks files generated when they appear in a manifest outputs list (explicit). Tracing Jinja2 variable expansions requires full template evaluation.
- **Shell scripts and binary files as leaf nodes.** Currently remain as unresolved string targets if referenced. First-class graph rendering with distinct style is a v2.1 option.
- **elkjs as primary layout (currently skeleton).** computeElkLayout() is wired and validated. Promote it and remove sync fallback when visual polish is a priority.
- **Logical-ID whitelist widening + --logical-id-declarer-tags CLI flag.** Current whitelist (param, entry, item, catalogue, scheme) is a hardcoded internal constant. A CLI flag would let users adapt it to their codebase without code changes.
- **replace-an-LLM follow-up as parent theme.** The above items collectively move viva toward semantic linking that currently requires LLM inference. They are independent increments on the trust-anchored baseline established here.

## Lessons Carried Forward

- **Two-pass implementation reveals plan resumability gaps.** Session 1 bailed at 5/29; session 2 drove to completion. For features with more than 15 tasks, designate mid-feature save-points in the plan with named commit hashes so a second session can pick up without re-reading the full task list.
- **Re-crawl byte-identical invariant (C.6) is non-negotiable.** The test_dogfood_recrawl_byte_identical guardrail was included in every crawler module that touched discovery or emission. Standard practice going forward on any crawler feature.
- **target-profile-example pattern works.** Documenting one real-world codebase as informative evidence (not prescriptive spec) gave the implementation concrete patterns to accommodate without constraining generality. Keep this pattern for future features with real-world dogfood context.
- **FPS gate early in the V-stream.** Measuring at I.1 (after V.4, before V.5-V.10) means a React Flow performance failure would be caught before the entire viewer stream is invested. Keep this sequencing on future scale-sensitive features.
- **Tightly coupled component pairs need one plan entry.** V.3 and V.4 were planned as distinct tasks but were coupled in practice. Anticipate import coupling and plan them together from the start.

## Retrospective

### Worked Well

- FPS gate placed early (I.1 before V.5-V.10): caught any React Flow scaling issue before investing the full viewer stream. Gate passed at 17.90 ms p95, 46% under the 33 ms threshold.
- Foundation stream (F.1-F.4) locked schema before C/V diverged: no mid-stream schema renegotiation. The camelCase/snake_case key-reference table in GRAPH-SCHEMA.md prevented the parse_error/parseError confusion that bit xml-viewer-hardening post-finalize.
- Re-crawl byte-identical invariant: guardrail against the xml-viewer-hardening feedback-loop class of bug. Carried into every new crawler test module.
- Single source of truth for layout constants in layout.ts.
- Commit discipline: 21 commits, all correctly prefixed, zero Claude trailers (grep-verified).

### Went Wrong

- Session 1 stalled at 5/29: first implementation session completed Foundation but could not sustain through crawler + viewer streams. XL-scope features need explicit mid-feature save-points with commit hashes in the plan.
- V.3/V.4 coupling discovery mid-implementation: should have been planned as one task. Tight component coupling should be anticipated in the plan.
- 588 lint count without inline context: all pre-existing .vite/deps, but alarming without the note. Consider .eslintignore for .vite/ as a housekeeping item.

### Process

- Pipeline flow: two sessions (first stalled at F.4; second drove F.5-I.6 to completion). progress.md made the second-session handoff clean.
- Task granularity: 29 tasks at the right detail level for TDD; XL for single-session throughput. Correct for the scope; multi-session sequencing should be anticipated.
- Estimate accuracy: plan L/XL; actual two sessions. Consistent.
- Agent delegation: serially executed. Concurrent backend-agent / frontend-agent delegation would shorten wall clock time on future XL features with well-defined parallel streams.
