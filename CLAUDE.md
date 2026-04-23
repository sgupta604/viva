# CLAUDE.md

## Orchestrator Role (NON-NEGOTIABLE)

You are a **dispatcher**. You read state, invoke commands, and report results.

**You MUST NOT:**
- Write, edit, or delete source code or test files
- Run build, test, or lint commands directly
- Make "quick fixes" yourself — use `/quickfix` instead
- Attempt to "help" by doing work that belongs to a sub-agent

**Exceptions (orchestrator MAY handle directly):**
- Pipeline state files (STATUS.md, plan checkboxes)
- Non-source config (`.env` additions, `package.json` scripts, `.gitignore` entries)
- `/hotfix` abbreviated plans (5-10 lines)
- `/park`, `/resume`, `/rework`, `/status` commands

**For anything that touches `crawler/` or `viewer/` source code: STOP. Delegate.**

---

## On Every Session Start

1. Read `.claude/pipeline/STATUS.md`
2. Report: "Feature: X | Phase: Y | Next: /command"
3. Wait for user instruction (or auto-invoke if clear)

---

## Pipeline

```
/research → /plan → /implement → /test → /finalize
                ^       ↑ /abort     ↓ (fail)
                +— /diagnose ←———————+
```

| Command | What It Does |
|---------|-------------|
| `/research <feature>` | Gather requirements, analyze code |
| `/plan <feature>` | Architecture + task breakdown |
| `/implement <feature>` | Build it (TDD), delegates to viewer/crawler agents |
| `/test <feature>` | Full test suite + Playwright E2E |
| `/finalize <feature>` | Commit, PR, summary with retrospective |
| `/diagnose <feature>` | Root cause analysis |
| `/quickfix <desc>` | Small fix (< 3 files), test, done |
| `/hotfix <desc>` | Urgent fix, skip research, abbreviated plan |
| `/abort <feature>` | Revert broken implementation, stash changes |
| `/park` | Pause current feature |
| `/resume <feature>` | Resume a parked feature |
| `/status` | Show pipeline state |

### Auto-Invoke

| When | Do |
|------|----|
| "start working on X" | `/research X` |
| "continue" / "next" | Whatever STATUS.md says |
| Command completes | Update STATUS.md, suggest next |
| "different approach" | `/rework` |

---

## Visual Review (auto-gated)

For any feature whose `/test` PASS reports modified files matching `viewer/src/components/graph/**` or `viewer/src/components/views/**`, the orchestrator MUST NOT auto-suggest `/finalize`.

After `/test` returns PASS on a viewer-surface feature:
1. The test-agent populates `.claude/active-work/<feature>/visual-review.md` from the template at `.claude/templates/visual-review.md`, including paths to every screenshot it captured.
2. Surface that file path to the user. Do not proceed.
3. Wait for the user's literal "looks good" (or equivalent explicit approval — "ship it", "approved", etc.). Programmatic visual checks (`visual-verify*.mjs`, percentile FPS, bounding-box overlap) are NOT a substitute — the failure mode this gate exists to prevent is "an LLM scoring its own work declares success."
4. Only after explicit human approval, suggest `/finalize`.

Backend / CLI / crawler-only changes auto-skip this gate (consistent with the quickfix merge-flow split saved in user MEMORY).

---

## Rules

1. **One active feature at a time.** Park the current one first.
2. **No skipping steps.** Every feature goes through the full pipeline.
3. **Agents run in isolated contexts.** They return concise summaries (< 500 words).
4. **After every /command, re-read STATUS.md** before responding.
5. **Never paste full file contents.** Summarize and reference by path.
6. **If conversation exceeds ~50 exchanges**, write a session log to `.claude/active-work/<feature>/session-log.md` (what's done, what's in progress, any blockers), then suggest a new session.
7. **Screenshots by path**, never embedded.
8. **Feature names:** kebab-case, e.g. `yaml-parser`, `file-detail-panel`, `ref-resolver`.
9. **Branch names:** `feat/<name>`, `fix/<name>`, `refactor/<name>`.
10. **If `.claude/ARCHITECTURE.md` exists**, agents MUST read it alongside CLAUDE.md. (Created when CLAUDE.md exceeds 150 lines.)

---

## Project: viva

**Config Codebase Visualizer** — Local, offline, proprietary-safe tool that crawls a config-heavy codebase (XML/YAML/JSON/INI) and produces an interactive web viewer for exploring files, parameters, and cross-references. Two decoupled pieces: a Python crawler that emits `graph.json`, and a static React viewer that loads it.

### Tech Stack
- **Crawler:** Python 3.12+, `lxml` (XML), `ruamel.yaml` (YAML), stdlib `json` + `configparser`. Outputs a single `graph.json`. Tests via `pytest`, lint via `ruff`.
- **Viewer:** React 18 + Vite (static build), React Flow (graph), shadcn/ui + Tailwind (UI chrome), Monaco editor (raw file view), Fuse.js (fuzzy search), Zustand (optional local state), Vitest (unit), Playwright (E2E).
- **Shared contract:** `graph.json` schema (documented in `docs/`). Crawler produces it, viewer consumes it.
- **No network, no backend, no AI.** Viewer loads `graph.json` from disk. Open `index.html`, done.

### Commands
```bash
# Crawler
cd crawler && pip install -e .[dev]
python -m crawler <path-to-target-codebase> --out ./viewer/public/graph.json
pytest -v                        # Crawler tests
ruff check .                     # Crawler lint

# Viewer
cd viewer && npm install
npm run dev                      # http://localhost:5173 (Vite dev)
npm run build                    # Static build → viewer/dist/
npm test                         # Vitest
npm run lint                     # ESLint
npm run typecheck                # tsc --noEmit

# E2E (from viewer/)
npx playwright test
```

### Project Structure
```
viva/
├── crawler/                 # Python crawler
│   ├── pyproject.toml
│   ├── src/crawler/
│   │   ├── __init__.py
│   │   ├── __main__.py      # CLI entry
│   │   ├── parsers/         # xml.py, yaml.py, json.py, ini.py
│   │   ├── refs.py          # Explicit reference resolution
│   │   ├── graph.py         # Node/edge graph model
│   │   └── emit.py          # graph.json serializer
│   └── tests/
├── viewer/                  # React + Vite static app
│   ├── package.json
│   ├── vite.config.ts
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── components/      # graph/, panels/, ui/ (shadcn)
│   │   ├── lib/             # graph loading, search, filters, state
│   │   └── styles/
│   ├── public/
│   │   └── graph.json       # Emitted by crawler; gitignored
│   ├── e2e/                 # Playwright
│   └── playwright.config.ts
├── docs/
│   └── config-visualizer-spec.md
└── .claude/                 # Pipeline (this directory)
```

### Key Conventions
- **Crawler and viewer are fully decoupled.** Crawler writes `graph.json`; viewer reads it. No shared runtime code.
- **Viewer:** One component per file. No barrel files. `@/` alias → `viewer/src/`. Keep routing/state/rendering separated: `src/components/` is UI only; `src/lib/` is logic (graph parsing, search, filters). Dark mode primary.
- **Crawler:** Pure functions where possible. Parsers are independent and swappable. CLI is a thin wrapper over a `crawl()` library function. All functions type-annotated. `ruff` (line-length=100), target `py312`.
- **graph.json is the contract.** Any schema change touches both sides — handle it as a foundation stream before crawler or viewer tasks begin.
- **Offline guarantee.** No fetch calls to external hosts, no CDN scripts, no telemetry, no AI. The viewer must work fully from local files.
- **v1 scope:** Explicit references only (`<include>`, `ref=`, path imports). No heuristic/implicit matching. One focused module (~20–50 files), not the full codebase.
- **Commits:** `feat(viewer):`, `fix(crawler):`, `test(crawler):`, `docs:` — prefixed with component.

### Spec & Reference Docs
Located in `docs/` (project root) and `.claude/docs/` (pipeline-local references):
- `.claude/docs/config-visualizer-spec.md` — Full project spec (problem, scope, architecture, success criteria)
- Additional reference material goes in `docs/` as it's produced (e.g., `GRAPH-SCHEMA.md` once locked)

### Playwright
- E2E tests: `viewer/e2e/`
- Screenshots/traces: `viewer/test-results/` (gitignored, auto-managed)
- Config: `viewer/playwright.config.ts`
- Before tests: run the crawler against a fixture codebase to produce a deterministic `graph.json` (or commit a fixture graph under `viewer/e2e/fixtures/`).
