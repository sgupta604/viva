# Summary: ghcr-publish

**Completed:** 2026-04-18 | **Branch:** feat/ghcr-publish | **PR:** https://github.com/sgupta604/viva/compare/feat/runtime-image...feat/ghcr-publish?expand=1

## What Was Built

A GitHub Actions workflow (`.github/workflows/publish-image.yml`) that automatically builds the root `Dockerfile` and publishes the image to `ghcr.io/sgupta604/viva` on every push to `main`, on `v*.*.*` tag pushes, and on `workflow_dispatch`. Pull requests trigger a build-only run (no push) for Dockerfile regression checking. `docker/metadata-action@v5` computes all tags automatically; `GITHUB_TOKEN` with `packages: write` handles auth — no PAT, no repo secrets. A companion `docs/RELEASE.md` documents the one-time manual step (flipping GHCR visibility to Public) and the full release workflow. `docker/README.md` was restructured to promote `docker pull` as the primary usage path with build-locally moved to a Fallback section.

## CRITICAL: Manual Action Required Before docker pull Works

**After the PR merges and the first workflow run succeeds, a human must manually flip the GHCR package to Public.** Until this is done, every `docker pull ghcr.io/sgupta604/viva` returns 403 or 404 and the one-line UX is broken even though the image exists. Steps are in `docs/RELEASE.md` Section 1. Short version:

1. Go to `https://github.com/sgupta604/viva/pkgs/container/viva`
2. Package settings → Danger Zone → Change visibility → Public → confirm
3. Verify from any machine: `docker pull ghcr.io/sgupta604/viva:latest` (no login required)

## Files Changed

| Component | File | Change |
|-----------|------|--------|
| CI | `.github/workflows/publish-image.yml` | NEW — build + publish workflow; PR validate-only, main/tag push to GHCR; GITHUB_TOKEN auth; metadata-action tag ladder; GHA cache |
| Docs | `docs/RELEASE.md` | NEW — first-publish setup checklist, cutting-a-release steps, tag strategy |
| Docs | `docker/README.md` | Modified — promote docker pull to primary; add --pull=always variant; restructure build-locally as Fallback section |
| Docs | `README.md` | No edit — runtime-image had already placed the correct pullable one-liner (verified byte-identical) |
| Config | `.gitattributes` | No edit — existing catch-all already covers *.yml |

## Tests

- Crawler (pytest): 48 passing
- Viewer (Vitest): 23 passing
- E2E (Playwright): 1 passing (offline.spec.ts)
- Build: N/A — zero viewer source changes
- Lint: clean (ruff, ESLint, tsc)
- YAML parse: pass
- actionlint: SKIPPED — not installed on runner

## Key Decisions

- Single conditional job rather than separate validate + publish jobs — simpler, one moving part
- Major-version action pins (@v4, @v5) not SHA-pins — security hardening is a follow-up
- :latest tracks main, not last stable tag — fast teammate iteration
- GITHUB_TOKEN only — no PAT; packages: write at workflow scope is sufficient
- No .gitattributes edit — existing catch-all is cleaner than a redundant *.yml rule
- Manual "make public" step stays manual — documented in docs/RELEASE.md, not automated
- Zero source code touched — all work is CI config + docs

## Deferred Items

- Multi-arch (arm64): lxml wheel risk from runtime-image; defer until wheel ships reliably
- cosign signing: non-goal in MVP
- SBOM generation (syft/grype): non-goal in MVP
- Container vulnerability scanning (trivy): non-goal in MVP
- SHA-pinning of Actions: Renovate/Dependabot follow-up
- Auto-semver / semantic-release: not needed at this scale

## Stacked-PR Merge Order

Branch chain: main <- feat/v1-demo <- feat/runtime-image <- feat/ghcr-publish (feat/devcontainer parked off feat/v1-demo).

Merge in this exact order:
1. feat/v1-demo to main
2. feat/runtime-image to main
3. feat/ghcr-publish to main
4. After step 3: flip GHCR visibility to Public (see Critical section above)
5. feat/devcontainer: reconcile overlapping .gitattributes/README.md edits, then merge

## Retrospective

### Worked Well

- Smallest feature in the pipeline so far: five tasks, all CI config + docs, zero source code. Research pre-resolved every design decision so implement had zero judgment calls — pure transcription. This is the pipeline working as intended.
- One-pass implement, no retries. All five tasks completed in a single agent run. The research-locks-everything pattern (pioneered in v1-demo, refined in runtime-image) paid off again.
- Self-validating workflow: the PR that introduces publish-image.yml also runs it (build-only path), so broken YAML surfaces as a failing PR check before merge.
- Scope discipline held: zero crawler or viewer source touched; diff is exactly .github/, docker/README.md, and docs/RELEASE.md.

### Went Wrong

- Pipeline scope drift on T1.3 (root README). runtime-image had already written the exact content that ghcr-publish's plan expected to own. T1.3 became a no-op. Lesson: plan docs for stacked features should include a "content already provided by prior stack member" section so implement agents can quickly verify rather than re-author. Plan boundaries between stacked features need to be more explicit.
- actionlint not installed — second occurrence (first was runtime-image .sh scripts). Both test reports record "SKIPPED — not installed." YAML parse + PR-self-validation covers the same ground, but this should be a standing note in the dev machine setup checklist. Recommendation: add actionlint install step to onboarding docs or add it to a future CI job.

### Process

- Pipeline flow: smooth — research → plan → implement → test → finalize with no backtracking
- Task granularity: right — five tasks, each with a clear accept criterion
- Estimate accuracy: S scope estimated and actual; exact match
- Agent delegation: execute-agent handled all five tasks directly (no frontend/backend spawns); test-agent ran full regression sweep cleanly. No agent struggled.
