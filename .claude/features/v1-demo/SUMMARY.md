# Summary: v1-demo

**Completed:** 2026-04-18 | **Branch:** feat/v1-demo | **PR:** https://github.com/sgupta604/viva/compare/main...feat/v1-demo?expand=1

## What Was Built

A complete v1 of the viva config-codebase visualizer: a Python 3.12 crawler that walks a directory tree, parses XML/YAML/JSON/INI files, resolves explicit cross-file references, and emits a deterministic graph.json; plus a static React 18 + Vite viewer that loads that file and renders a grouped, interactive React Flow map with a file detail panel (param tree + lazy Monaco raw source), Cmd/Ctrl+K fuzzy search, kind/folder/test filters, param-based highlighting, and dark-mode chrome. Zero network I/O anywhere. The two sides share only a locked schema contract (docs/GRAPH-SCHEMA.md).

## Files Changed

| Component | File | Change |
|-----------|------|--------|
| root | .gitignore, .gitattributes | Initial project hygiene; LF normalization |
| docs | docs/GRAPH-SCHEMA.md | Locked graph.json contract (foundation deliverable) |
| crawler | crawler/pyproject.toml | Project scaffold: lxml, ruamel.yaml, ruff, pytest |
| crawler | src/crawler/graph.py | FileNode, ParamNode, Edge, Graph, RawRef dataclasses |
| crawler | src/crawler/discovery.py | POSIX walker + include/exclude globs + dotfile skip |
| crawler | src/crawler/parsers/xml.py | lxml binary parser, parseError capture, include/ref/import refs |
| crawler | src/crawler/parsers/yaml.py | ruamel.yaml safe, anchors, multi-doc, !include |
| crawler | src/crawler/parsers/json_.py | stdlib json, dollar-include detection, dotted key flattening |
| crawler | src/crawler/parsers/ini.py | configparser, case-preserving optionxform=str |
| crawler | src/crawler/parsers/__init__.py | Extension dispatcher |
| crawler | src/crawler/refs.py | resolve_references: path -> local-id -> global-id -> unresolved |
| crawler | src/crawler/emit.py | Deterministic JSON emit, --no-timestamp, LF newlines, --emit-sources |
| crawler | src/crawler/__main__.py | argparse CLI |
| crawler | tests/fixtures/sample-module/** | 16-file radar-module fixture (xml/yaml/json/ini/broken/ghost-ref/tests) |
| crawler | tests/fixtures/sample-module.expected.graph.json | Committed byte-locked expected crawl output |
| crawler | tests/test_*.py | 48 pytest tests (unit + integration) |
| viewer | package.json, tsconfig.json, vite.config.ts, etc. | Vite + TS + Tailwind + ESLint toolchain |
| viewer | src/lib/graph/types+schema+load+layout.ts | Graph types, zod validator, loader, dagre layout |
| viewer | src/lib/state/graph+selection+filter-store.ts | Zustand stores |
| viewer | src/lib/search+filters+highlight | Fuse.js index, pure filter predicates, param-refs resolver |
| viewer | src/components/graph/* | GraphCanvas, FileNode, FolderGroup, EdgeStyles |
| viewer | src/components/panels/FileDetailPanel+ParamTree+RawSourceView.tsx | Side panel: param tree + lazy Monaco (local bundle, TR1 safe) |
| viewer | src/components/search/SearchPalette.tsx | shadcn Command, Cmd/Ctrl+K |
| viewer | src/components/filters/FilterBar.tsx | Hide-tests (default on), kind checkboxes, folder filter |
| viewer | src/App.tsx | Dark-mode chrome, global keybindings |
| viewer | e2e/*.spec.ts + global-setup.ts | 13 Playwright tests including offline.spec.ts |
| viewer | e2e/fixtures/graph.json | Committed deterministic fixture (byte-identical to crawler expected) |

## Tests

- Crawler (pytest): 48 passing (43 unit + 5 integration)
- Viewer (Vitest): 23 passing across 8 test files
- E2E (Playwright/Chromium): 13 passing, including offline.spec.ts with Monaco forced-load
- Build: pass (initial bundle 469 kB gzip 150 kB; Monaco lazy chunk 4.3 MB gzip 1.1 MB)
- Lint: clean (ESLint 0 errors, tsc --noEmit clean)
- Ruff: BLOCKED by Windows AppContainer sandbox (WinError 5) -- verify manually: cd crawler && ruff check .

## Key Decisions

- **Schema locked upfront as a foundation task.** docs/GRAPH-SCHEMA.md was the first deliverable, blocking both crawler and viewer streams. This eliminated schema-drift risk and enabled true parallel development.
- **Committed fixture graph.json in two places** (crawler/tests/fixtures/sample-module.expected.graph.json and viewer/e2e/fixtures/graph.json, byte-identical). Viewer developed against a stable fixture while the crawler was still in flight.
- **Monaco local bundle via loader.config({ monaco }).** The @monaco-editor/react default loader fetches Monaco from jsdelivr at runtime. Overridden by importing monaco-editor directly and calling loader.config({ monaco }) before init. Monaco remains a lazy chunk (~4.3 MB); the CDN string in the library default config object is dead code at runtime. Playwright offline.spec.ts confirms zero external requests.
- **tsc --noEmit instead of tsc -b.** The composite/project-references setup emitted .js/.d.ts sidecars alongside every e2e/*.ts, causing Playwright to run each spec twice with flaky failures. Replaced with plain tsc --noEmit; Vite handles the actual bundling.
- **dagre for layout, v1 scope.** Simpler than elkjs, sufficient for 50 nodes grouped by folder.
- **Self-hosted fonts.** @fontsource/inter + @fontsource/jetbrains-mono in globals.css. No Google Fonts CDN (TR1).
- **Hide-tests filter default ON.** Matches the new-engineer-exploring-module-shape user story.
- **HH-MM-SS timestamp convention on Windows.** NTFS forbids colons in filenames; all pipeline files use dashes in the time portion.

## Deferred Items

- **Ruff check in sandbox (WinError 5).** Ruff v0.15.11 is installed and config is in pyproject.toml, but the Windows AppContainer sandbox blocks subprocess execution. Verify manually before PR merge: cd crawler && ruff check .
- **--emit-sources is optional and off by default.** Raw-source viewing requires re-running the crawler with --emit-sources. A richer browse UX is deferred to v2.
- **elkjs / large-graph layout.** dagre is adequate for ~50 nodes; revisit at larger scale.
- **Implicit reference detection.** Intentionally out of scope for v1.
- **Windows timestamp convention in WORKFLOW.md.** Both research and plan agents flagged the HH:MM:SS vs HH-MM-SS drift. WORKFLOW.md should be updated before the next feature.

## Retrospective

### Worked Well

- **Contract-first stream parallelism.** Locking the graph.json schema before either stream began was the highest-leverage decision. With a committed fixture graph.json from day one, the crawler and viewer streams ran genuinely in parallel with no blocking and no mid-stream schema renegotiation.
- **Fixture-first TDD on the crawler.** Writing the fixture file and expected parse result before each parser kept scope tight and caught edge cases (encoding quirks, malformed XML, YAML anchor resolution) before they compounded.
- **offline.spec.ts extended to force the Raw tab.** The original offline spec would have passed even with the CDN regression active (Monaco is lazy and does not load on page open). Extending the test to open the Raw tab caught the jsdelivr fetch before it shipped. Lesson: offline regression tests must exercise all lazy import paths explicitly.
- **Zustand store isolation.** No cross-store imports, pure selectors. The separation of graph/selection/filter stores made Vitest straightforward and kept the component tree clean.
- **Dark-mode-first styling.** Tailwind dark: class strategy + shadcn/ui meant zero per-component light/dark overrides.

### Went Wrong

- **Monaco CDN loader near-miss (TR1 regression, almost shipped).** The initial RawSourceView used @monaco-editor/react default loader, which silently references cdn.jsdelivr.net for runtime fetches. A naive offline test (never opening the Raw tab) would have passed and the CDN fetch would have gone undetected until real offline use. Lesson: any library that lazy-fetches at runtime can mask offline violations; the offline test must explicitly trigger every lazy import path.
- **tsc -b composite emit leaking sidecar files.** The original tsconfig used project references (composite: true) causing tsc -b to emit .js/.d.ts files alongside every e2e/*.ts. Playwright ran each spec twice, producing flaky failures from double-execution of stateful store tests. Fix was clean but cost debugging time. Lesson: when combining Vite + Playwright + TypeScript, verify that the build command does not emit TypeScript artifacts into the source tree.
- **HH:MM:SS vs HH-MM-SS Windows filename convention drift.** WORKFLOW.md specifies HH:MM:SS but NTFS forbids colons in filenames. Both research and plan agents noted this independently and applied the dash convention locally, but WORKFLOW.md was never corrected. Lesson: when a documented pipeline convention is found to be platform-incompatible, updating the doc should be a blocking task, not a note.

### Process

- **Pipeline flow:** Smooth. Foundation -> Parallel C+V -> Integration -> Test -> Finalize worked as designed. The only serialization point was the brief Integration stream (I.1-I.3).
- **Task granularity:** Right size. One parser per C-stream task kept scope tight and enabled clean completion. V-stream tasks were slightly coarser but followed a sensible dependency order.
- **Estimate accuracy:** Scope L was accurate. The viewer stream took longer than expected due to the Monaco CDN regression investigation and the tsc composite fix.
- **Agent delegation:** Backend-agent handled the full crawler stream cleanly. Frontend-agent handled the viewer. The Monaco CDN fix was caught during the Integration stream by the execute-agent reviewing offline test output. Both agents respected the lib/components split.
