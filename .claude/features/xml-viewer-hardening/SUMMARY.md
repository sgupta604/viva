# Summary: xml-viewer-hardening

**Completed:** 2026-04-21 | **Branch:** feat/xml-viewer-hardening | **PR:** (see STATUS.md)

## What Was Built

Three pain points exposed by dogfooding viva against a real company config codebase were addressed in a single branch. The XML crawler was hardened to recover from xi:include undeclared-namespace errors and from partial/malformed XML, now emitting a node with recovered params and a visible error rather than silently dropping the file. The viewer gained three view modes (graph, folders, table) with a dedicated view-store Zustand slice, plus inline parse-error display with a view-raw-anyway action. Source emission (--emit-sources) was flipped to default on.

## Files Changed

| Component | File | Change |
|-----------|------|--------|
| docs | docs/GRAPH-SCHEMA.md | Partial-parse semantics paragraph |
| crawler-fixture | crawler/tests/fixtures/sample-module/config/xi-include.xml | NEW |
| crawler-fixture | crawler/tests/fixtures/sample-module/config/entity-decl.xml | NEW |
| crawler-fixture | crawler/tests/fixtures/sample-module.expected.graph.json | Regen 16 to 18 files |
| viewer-fixture | viewer/e2e/fixtures/graph.json | Mirror of regen |
| crawler | crawler/src/crawler/parsers/xml.py | recover=True; href+ENTITY capture |
| crawler | crawler/src/crawler/refs.py | Hash-index O(1) replaces linear probe |
| crawler | crawler/src/crawler/__main__.py | --emit-sources default=True; --jobs |
| crawler | crawler/src/crawler/__init__.py | ThreadPoolExecutor opt-in |
| crawler-test | crawler/tests/test_parsers_xml.py | +5 tests |
| crawler-test | crawler/tests/test_refs.py | +1 regression test |
| crawler-test | crawler/tests/test_cli.py | NEW: 7 argparse tests |
| crawler-test | crawler/tests/test_integration.py | Updated counts; determinism test |
| crawler-test | crawler/tests/test_dogfood.py | NEW @integration dogfood test |
| viewer-state | viewer/src/lib/state/view-store.ts + test | NEW Zustand slice |
| viewer-lib | viewer/src/lib/views/sort.ts + test | NEW pure sortFiles |
| viewer-lib | viewer/src/lib/views/group.ts + test | NEW pure groupByFolder |
| viewer-ui | viewer/src/components/filters/ViewModeBar.tsx | NEW |
| viewer-ui | viewer/src/components/views/FolderView.tsx | NEW |
| viewer-ui | viewer/src/components/views/TableView.tsx | NEW |
| viewer-ui | viewer/src/App.tsx | Wire ViewModeBar + viewMode switch |
| viewer-ui | viewer/src/components/panels/FileDetailPanel.tsx | view-raw-anyway button |
| viewer-ui | viewer/src/components/panels/RawSourceView.tsx | Reworded 404; plaintext for errors |
| viewer-e2e | viewer/e2e/view-modes.spec.ts | NEW: 7 specs |
| viewer-e2e | viewer/e2e/parse-error-panel.spec.ts | NEW: 3 specs |
| viewer-e2e | viewer/e2e/offline.spec.ts | +source-404 spec |
| viewer-e2e | viewer/e2e/global-setup.ts | Stage fixture into dist/ + public/ |

## Tests

- Crawler (pytest): 68 passing (includes 9 integration)
- Viewer (Vitest): 47 passing across 11 test files
- E2E (Playwright): 24 passing (7 view-modes + 3 parse-error-panel + 2 offline + 12 pre-existing)
- Build: pass (Monaco lazy chunk ~4.3 MB preserved)
- Lint: clean (src/; pre-existing ruff UP/F401 in legacy crawler files pre-date this branch)
- Typecheck: clean

## Performance

--jobs 1 default: 406.6 ms. --jobs 4: 277.6 ms (-32%). Decision: keep default=1; 130 ms absolute savings are sub-perceptible on laptop workloads. Users on large codebases can opt in.

Parse-error baseline: 3 (intentional broken.xml copies). Unchanged after xi-include + entity-decl additions.

## Key Decisions

1. NS_ERR_UNDEFINED_NAMESPACE filtered from parse_error -- recover mode handles it cleanly; flagging spams dogfood crawls. Documented in xml.py.
2. parseError stays a string, no schema change -- partial-parse content in existing params[]/raw_refs[] arrays.
3. --jobs stays default=1 -- 32% win clears the 30% gate but absolute savings do not justify breaking compat.
4. view-store.ts is a fresh Zustand slice -- no cross-store imports; DECISIONS.md modular-stores boundary respected.
5. Monaco plaintext when parseError is set -- avoids XML highlighting choking on malformed content.
6. ENTITY declarations surface as RawRef(kind="include") -- xi:fallback children ignored in v1.
7. global-setup stages fixture into both public/ and dist/ -- removes hidden build-order dependency from E2E.

## Deferred Items

- Smart static analysis: dead-param detection, orphan-ref detection, cycle detection, cross-file schema inference. Explicit next branch.
- xi:fallback handling (v1 follow-up).
- XPointer fragment resolution on href with fragment identifiers.
- Default parallel parse (--jobs=1; users on large codebases opt in).
- ESLint ignoring .vite/deps/ -- pre-existing config gap.
- ruff UP/F401 auto-fixable warnings in legacy crawler files.
- TableView aria-sort + scope="col" on sortable column headers.
- Fresh-repo migration (clean history, separate effort per MEMORY.md).
- Plan Mode (design locked in DECISIONS.md, ready for /research plan-mode).

## Retrospective

### Worked Well

- Fixture-first TDD on the crawler: writing xi-include.xml + entity-decl.xml and failing tests before touching xml.py kept scope honest and made C.2 implementation straightforward.
- Modular Zustand separation: view-store.ts as a fresh file with zero cross-store imports made the viewer stream frictionless. The DECISIONS.md boundary held without refactor pressure.
- Foundation stream sequencing: F.1 + F.2 up front, F.3 after C.2/C.3, letting V-stream develop against the current committed fixture. No merge conflicts.
- global-setup dual-staging: staging fixture into dist/ as well as public/ is now a permanent guard against stale-build E2E environment errors.
- Dogfood integration test with structural invariants: asserting upper bounds rather than exact counts means the test will not go flaky as the repo grows.

### Went Wrong

- First Playwright run produced 11 failures -- stale dist/ from a lint-comparison build on main. Diagnosis took a round-trip. Lesson: build on the feature branch before running Playwright, or make E2E setup self-healing (which global-setup now does).
- C.1 test assertion pivot -- the plan asserted parser properties as post-construction attributes, but lxml does not expose them. A REPL check during research would have caught this before writing the test spec.
- NS_ERR_UNDEFINED_NAMESPACE conflict mid-implementation -- the plan text conflicted with the C.1 assertion that xi-include produces parse_error is None. The resolution is correct but was not anticipated; should have been an explicit open question in the research doc.

### Process

- Pipeline flow: smooth -- no aborts or reworks needed.
- Task granularity: right -- F/C/V streams parallelized well; I-stream serial gate worked as intended.
- Estimate accuracy: 22 of 23 plan tasks complete before /test; I.3 deferred to /test by design.
- Agent delegation: Sub-agent tool unavailable in this environment; execute-agent handled all streams directly following frontend/backend conventions. Stream separation kept work organized.
