# viva — Config Visualizer Dev Pipeline

Claude Code development pipeline for **viva**, a local, offline config-codebase visualizer. Drop `CLAUDE.md` and `.claude/` into the repo root.

## Using viva on your codebase

viva crawls a config-heavy codebase (XML / YAML / JSON / INI) and serves an
interactive viewer for the graph of files and cross-references. Offline,
local-only, no telemetry. One command to run it against any codebase:
(second one is to pull latest from main)
```bash
docker run --rm -v "$(pwd):/target:ro" -p 5173:5173 ghcr.io/sgupta604/viva

docker run --pull=always --rm -v "$(pwd):/target:ro" -p 5173:5173 ghcr.io/sgupta604/viva
```

Open <http://localhost:5173> in your browser.

See [`docker/README.md`](docker/README.md) for Windows / PowerShell quoting,
port remapping, crawler flag passthrough, and troubleshooting.

## Setup

1. `CLAUDE.md` and `.claude/` live at the repo root
2. Ensure `.claude/active-work/` is gitignored
3. Start Claude Code — it reads `STATUS.md` and prompts you

## Architecture

```
CLAUDE.md (always in context)
  ↓ user types /research <feature>
.claude/commands/research.md (trigger, ~20 lines)
  ↓ orchestrator spawns
.claude/agents/research-agent.md (brain, fresh context)
  ↓ writes output to
.claude/features/<feature>/2026-04-18T22:00:00_research.md
```

Three layers: `CLAUDE.md` (always loaded) → commands (triggers) → agents (brains in isolated contexts).

## Commands

| Command | What |
|---------|------|
| `/research <feature>` | Gather requirements |
| `/plan <feature>` | Architecture + tasks |
| `/implement <feature>` | Build (delegates to specialists) |
| `/test <feature>` | Full suite + Playwright |
| `/finalize <feature>` | Commit, PR, retrospective |
| `/diagnose <feature>` | Root cause analysis |
| `/quickfix <desc>` | Small fix, no pipeline |
| `/hotfix <desc>` | Urgent fix, skip research |
| `/abort <feature>` | Revert broken implementation, stash changes |
| `/rework <feature>` | Archive approach, reset to research |
| `/park` | Pause current feature |
| `/resume <feature>` | Resume parked feature |
| `/status` | Show pipeline state |

## Agents

### Pipeline (orchestrate WHEN)
| Agent | Model | Purpose |
|-------|-------|---------|
| research-agent | opus | Requirements + code analysis + retrospective review |
| plan-agent | opus | Architecture + task breakdown + contract-first streams |
| execute-agent | opus | Conductor — delegates to specialists, pre-flight checks |
| test-agent | sonnet | Run all suites, Playwright, handoff |
| finalize-agent | sonnet | Commit, PR, summary, retrospective, ADRs |
| diagnose-agent | opus | Root cause with evidence |

### Specialists (know HOW)
| Agent | Model | Domain |
|-------|-------|--------|
| frontend-agent | opus | **Viewer** — React 18, Vite, React Flow, shadcn/ui, Tailwind, Monaco, Fuse.js, Vitest, Playwright |
| backend-agent  | opus | **Crawler** — Python 3.12+, lxml, ruamel.yaml, stdlib json/configparser, pytest, ruff |

## Key Design Decisions

- **Orchestrator dispatches, doesn't code** — handles pipeline state and config; delegates all `crawler/` and `viewer/` source code to agents
- **Agents run in fresh contexts** — immune to long-session degradation
- **`graph.json` is a locked contract** — schema changes go through a foundation stream before crawler or viewer work begins
- **Specialists are domain-tuned** — viewer agent knows React Flow + shadcn + Monaco; crawler agent knows lxml, encoding quirks, and reference-resolution patterns
- **3 tiers:** quickfix (trivial) / hotfix (urgent) / full pipeline (features)
- **Plan + tasks = 1 file** — 3 committed files per feature total
- **Error handling baked in** — max retries, BLOCKED marking, failure routing, `/abort` for recovery
- **Self-check on every agent** — verify before declaring done
- **Retrospective feedback loop** — research-agent reads past "Went Wrong" sections before starting
- **Session continuity** — `session-log.md` written before suggesting new sessions
- **Offline guarantee** — no network calls from crawler or viewer; enforced in agent rules
