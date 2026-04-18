# Config Codebase Visualizer — Project Spec

## The problem

We have a proprietary codebase that is largely made up of deeply nested configuration files — XML, with some YAML/JSON/INI mixed in. New engineers spend real time just figuring out what's in these files, which files reference which, and where a given parameter is defined vs overridden vs consumed. The files themselves are too long and too cross-linked to read top to bottom.

There are tools in this space (Sourcegraph, CodeSee, Sourcetrail), but none of them are built for config-heavy codebases, and none of them are acceptable for code we can't send off-machine.

## What we're building

A local, offline tool that crawls a config codebase and produces an interactive, modern visual map of it. Two pieces:

1. **Crawler** — a script that walks a directory, parses every config file, and emits a single `graph.json` describing files, their contents at a useful level of detail, and the references between them.
2. **Viewer** — a static web app that loads `graph.json` and lets the user explore the codebase visually: graph of files, collapsible detail view, search, where-used, filters.

The whole thing runs locally. No network calls, no AI, no telemetry. Open `index.html`, done. This is non-negotiable because the code is proprietary.

## Users and use cases

- **New engineers** onboarding to a module: "show me the radar ingestion configs and how they fit together"
- **Current engineers** doing archaeology: "where is `threshold_rain` defined and who reads it?"
- **Reviewers** doing audits: "what does the structure of this module actually look like?"

## Scope — demo v1
/
The demo version should do these things well on a focused slice of the codebase (say, one module, ~20–50 files). Not the whole codebase.

- Crawl a directory, parse XML/YAML/JSON/INI into a node/edge graph
- Resolve explicit cross-file references (`include`, `ref=`, imports, path references)
- Render a zoomable, pannable graph of files, grouped by folder
- Click a file → side panel with a collapsible tree of its contents and the raw source
- Click a parameter → highlight every other file that references it or its name
- Global search across files and parameters
- Basic filters (hide tests, filter by file type, filter by folder)
- Modern, polished look — dark mode, readable typography, smooth interactions

### Non-goals for v1

- Editing files from the viewer
- Handling the full codebase — we'll handle one module well
- Implicit / heuristic reference detection (only explicit references in v1)
- Schema-aware validation (if there's an XSD, we ignore it for now)
- Diff between environments

## Architecture

```
[codebase on disk]
        │
        ▼
   [crawler.py]  ──►  graph.json
                         │
                         ▼
                   [viewer (static web app)]
                         │
                         ▼
                     [browser]
```

Crawler and viewer are fully decoupled. Crawler produces a JSON file; viewer consumes it. The viewer is a static bundle — no server, no backend. Drop the output folder next to the repo and open `index.html`. This keeps everything proprietary-safe and makes the tool trivial to distribute internally.

## Tech stack

**Crawler (Python)**
- `lxml` for XML — fast, handles messy real-world files
- `ruamel.yaml` for YAML, stdlib `json` and `configparser` for the rest
- Output: a single `graph.json` with a documented schema

**Viewer (static web app)**
- React + Vite, builds to static assets
- React Flow for the graph
- shadcn/ui + Tailwind for UI chrome — this combo is what gets us "modern and pretty" without a designer
- Monaco editor for raw-file view
- Fuse.js for fuzzy search

## Key open question to resolve before writing the crawler

How do references actually work in our configs?

- If they're **explicit** (`<include file="..."/>`, `ref="someId"`, namespaced imports), reference-detection is a small, reliable piece of code.
- If they're **implicit** (file A defines `threshold_rain`, file B uses the string `threshold_rain` somewhere), the crawler needs heuristic string matching, which means tuning and false positives.

**Action before day 1:** open 5–10 representative files and categorize how references show up. That decision shapes roughly half the crawler.

## Success criteria for the demo

A person who has never seen the module can:

1. Open the viewer and immediately see the shape of the module
2. Click on a file and understand what's in it without opening the XML
3. Pick a parameter and see everywhere it's referenced
4. Not feel like they're looking at a dev tool from 2009

If those four things work on a real slice of the codebase, the demo is a success.

## After the demo (v2 ideas, not for now)

- Implicit reference detection with tunable heuristics
- Diff view between environments (prod vs staging vs dev)
- Schema-aware grouping and validation if an XSD exists
- Handle the full codebase with lazy loading and hierarchical collapse
- Watch mode — viewer updates as files change on disk
