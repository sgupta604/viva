# Summary: runtime-image

**Completed:** 2026-04-18 | **Branch:** feat/runtime-image | **PR:** https://github.com/sgupta604/viva/compare/feat/v1-demo...feat/runtime-image?expand=1

## What Was Built

A multi-stage Docker image that lets any developer visualize their config codebase with a single `docker run` command. Stage 1 (`node:20-bookworm-slim`) builds the viewer with sourcemaps stripped; stage 2 (`python:3.12-slim-bookworm`) installs the crawler, serves pre-built static assets via `python -m http.server`, and runs a bash entrypoint that crawls the read-only `/target` mount then prints the localhost URL. Zero Node in the final image. Zero network calls at runtime.

## Files Changed

| Component | File | Change |
|-----------|------|--------|
| docker | `Dockerfile` | New. Multi-stage: node viewer-build + python:3.12-slim-bookworm runtime. OCI labels, non-root USER viva, EXPOSE 5173, ENTRYPOINT shell script. |
| docker | `.dockerignore` | New. Excludes `.git`, `.claude`, `node_modules`, `viewer/dist`, tests, caches, `__pycache__`, OS junk. |
| docker | `docker/entrypoint.sh` | New, 100755, LF. Crawl banner -> `python -m crawler` with `"$@"` passthrough -> URL echo -> `exec python -m http.server`. |
| docker | `docker/README.md` | New. One-liner (bash/PowerShell/cmd), port override, crawler args passthrough, offline BUILD-vs-RUNTIME paragraph, arm64 warning, troubleshooting. |
| viewer | `viewer/vite.config.ts` | One-line change: `sourcemap: true` -> `sourcemap: process.env.VITE_SOURCEMAP !== "0"`. Default stays ON; image build passes `VITE_SOURCEMAP=0`. |
| root | `README.md` | Added "Using viva on your codebase" section above existing Setup section with Docker one-liner and pointer to `docker/README.md`. |
| root | `.gitattributes` | Added `*.sh text eol=lf` and `docker/entrypoint.sh text eol=lf` to guarantee LF on Windows clones. |
| pipeline | `.claude/pipeline/STATUS.md` | Updated: runtime-image moved to Completed; next feature queued as ghcr-publish. |

## Tests

- Crawler (pytest): 48 / 48 passing
- Viewer (Vitest): 23 / 23 passing
- E2E (Playwright offline.spec.ts): 1 / 1 passing
- Viewer build (default, sourcemaps ON): pass
- Viewer build (`VITE_SOURCEMAP=0`, sourcemaps OFF): pass -- 0 `.map` files confirmed
- Viewer typecheck: clean
- Viewer lint: clean
- Crawler lint (ruff): deferred -- pre-existing Windows AppContainer WinError 5; no crawler source changed
- Docker build + smoke: DEFERRED -- Docker daemon not running in sandbox. Smoke commands to run before merge:

  ```bash
  docker build -t viva-test .
  docker run --rm -d --name viva-smoke \
    -v "$(pwd)/crawler/tests/fixtures/sample-module:/target:ro" \
    -p 15173:5173 viva-test
  curl -fsS http://localhost:15173/graph.json | python -c "import json,sys; d=json.load(sys.stdin); assert d['version']>=1; assert len(d['files'])>0"
  curl -fsS http://localhost:15173/ | grep -q '<div id="root"'
  docker stop viva-smoke
  docker image ls viva-test --format '{{.Size}}'   # target < 300 MB
  ```

## Key Decisions

- **Multi-stage Dockerfile.** Keeps Node (~200 MB) out of the runtime layer. Final image targets < 300 MB uncompressed.
- **`python -m http.server` over nginx.** Zero new dependency -- Python already present for the crawler. Viewer is a pure static SPA; stdlib server is sufficient.
- **Bash entrypoint, not inline CMD.** `set -euo pipefail` + `exec` on the final server call ensures SIGTERM from `docker stop` propagates cleanly.
- **Re-crawl every run, no cache volume.** No stale-graph confusion, no `--rebuild` flag, no named volume. Matches "really really really simple".
- **`"$@"` forwards to crawler, not server.** Power-user knob is include/exclude/emit-sources; server flags are irrelevant.
- **Sourcemap env-var gate (`VITE_SOURCEMAP`).** One-line diff in `vite.config.ts`. Default stays ON; container build passes `VITE_SOURCEMAP=0`. Strips ~43 MB from image.
- **amd64-only MVP.** Cuts buildx/qemu setup from this feature. Mac M1/M2 users run via emulation; documented.
- **Non-root USER viva (uid 1001).** Created at build time. Minimal privilege for runtime.
- **lxml runtime libs only (`libxml2`, `libxslt1.1`), no compilers.** lxml 5.x ships manylinux amd64 wheels; no `build-essential` in final image.

## Deferred Items

- **Docker build + smoke test.** Must be run manually on a Docker-enabled machine before merging the PR. See commands above.
- **Docker image size < 300 MB.** Requires daemon. Part of smoke steps.
- **arm64 / multi-arch build.** amd64 only in MVP. arm64 buildx is a follow-up feature; documented in `docker/README.md` with platform-mismatch warning for Mac M1/M2.
- **GHCR publish workflow (`ghcr-publish`).** Next queued feature -- the runtime image is not useful to end users until published to a pullable registry. GitHub Actions workflow to auto-build and push to `ghcr.io/sgupta604/viva` on release tags.
- **ruff lint.** Pre-existing Windows AppContainer WinError 5 blocks ruff binary in sandbox. No crawler source was changed; regression risk is zero. User to verify manually before merge.
- **`viewer/vite.config.js` sidecar regression-class fix.** Stale tsc-composite artifacts can shadow `.ts` source locally and confuse verification passes. A pre-commit hook that fails if `viewer/vite.config.js` exists would prevent recurrence. Queue as a quickfix.
- **Healthcheck.** Deferred for MVP. Good post-MVP quickfix candidate.
- **pip-install-serve path for Coder/devcontainer users without Docker-in-Docker.** Lower priority; depends on team Coder setup.

## Retrospective

### Worked Well

- **Single-stream, sequential implementation.** All seven tasks completed in order without blocking each other. No re-plan cycles.
- **Research pre-resolved all major design decisions.** Multi-stage vs single-stage, `http.server` vs nginx, re-crawl vs cache volume, amd64-only MVP, `VITE_SOURCEMAP` gate -- every non-obvious choice documented in research before any file was created. Zero re-plan cycles during implementation.
- **Sourcemap env-var gate is a minimal and reversible touch.** One-line diff, default stays ON, Docker build opts out explicitly. No other vite config touched.
- **Multi-stage build cleanly separated concerns.** Node artifacts stayed in stage 1. Final image has no `node_modules`, no npm, no Node binary. Enforced structurally, not by convention.
- **Reusing devcontainer-abandoned research productively.** ~20% directly applicable (base-image family, BUILD-vs-RUNTIME offline distinction, `.gitattributes` LF rule). The rest was correctly discarded rather than cargo-culted.

### Went Wrong

- **`viewer/vite.config.js` + `vite.config.d.ts` sidecars shadowed `vite.config.ts` again.** These are tsc-composite build leftovers. They are in `.gitignore` and were removed locally before the sourcemap gate could be verified. This is the same class of issue flagged in the v1 retrospective -- the v1 "Went Wrong" section identified it; it recurred anyway. "It is in .gitignore" is insufficient -- a developer's local environment accumulates these artifacts after any `tsc -b` run, and they silently shadow the `.ts` source for any tool resolving via Node module resolution. A pre-commit hook that fails if `viewer/vite.config.js` exists would catch this before it costs another verification round. Logged as a deferred quickfix.

- **Initial feature framing was wrong.** The first iteration of this work was `devcontainer` -- a contributor development environment. The user actually needed a runtime image for end users. One entire feature pipeline (research + plan + partial implement) was completed for the wrong artifact before the pivot. Lesson for the research agent: ask "who is the primary user of this feature -- the developer running it locally, or the end user distributing it?" as an explicit question. This cost approximately one feature-pipeline worth of effort, and devcontainer has overlapping `.gitattributes`/`README.md` edits that will need reconciliation at integration time.

- **Docker smoke test was not executable in the sandbox.** The Docker Desktop daemon was not running locally. This was anticipated in the plan (T7 had an explicit IF-Docker-NOT-available branch) and handled correctly. Not a process failure, but a deferred verification risk that must be resolved before the PR is merged.

### Process

- Pipeline flow: smooth. Research -> plan -> implement -> test -> finalize ran in sequence with no aborts or rework cycles.
- Task granularity: right. Seven tasks, each scoped to one file or one verification concern.
- Estimate accuracy: research estimated S-M leaning S (~1-1.5 dev-days). Actual was at the S end -- implementation completed in a single agent session.
- Agent delegation: execute-agent handled T1, T3-T7 cleanly. T2 (`vite.config.ts`) was executed by the conductor because no subagent spawn tool was available; the change was pre-specified to the line so no domain judgment was required. If the vite change had been more complex, the conductor would have been the wrong agent for it.
