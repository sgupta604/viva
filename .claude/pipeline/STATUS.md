# Pipeline Status

**Updated:** 2026-04-22

## Active

| Field | Value |
|-------|-------|
| Feature | large-codebase-viewer |
| Phase | plan-complete |
| Next | `/implement large-codebase-viewer` (starting now). Plan: `2026-04-22T05-15-00_plan.md`. 29 tasks (F=7, C=6, V=10, I=6). XL. Foundation sequencing: F.1→F.2+F.3→F.4 (blocks C+V). F.5 (3k synth fixture), F.6 (elkjs+worker), F.7 (FPS harness) in foundation so gate wires early. Post-F, C.1-C.5 concurrent + V.1/V.8/V.9 concurrent; V.2→V.3→V.4 critical path. FPS gate at I.1 (post-V.4, pre-V.5) — failure routes to /diagnose, not inline opt. Est ~24-32h wall-clock. |
| Branch | main (feat/large-codebase-viewer created at /implement time) |

## Reminders (surface when user returns)

- Fresh-repo migration (clean history, no Claude attribution) still on deck.
- Plan Mode design locked in `.claude/docs/DECISIONS.md`, ready for `/research plan-mode` when there's appetite.
- Product-strategy conversation: extending viva beyond config formats (Tier 1/2/3).
- After this branch merges: evaluate whether true heuristic/fuzzy ref matching (filename-glob inference) is worth a follow-up, or if the declared-ID scope is enough.

## Queue

_(empty)_

## Completed

| Feature | Date | PR / Merge |
|---------|------|----|
| xml-viewer-hardening | 2026-04-21 | merged to main (fast-forward, 14 commits, tip `d1ed38b`) |
| v1-demo | 2026-04-18 | merged to main |
| runtime-image | 2026-04-18 | merged to main |
| ghcr-publish | 2026-04-18 | merged to main |

## Parked

| Feature | Phase | Reason | Branch |
|---------|-------|--------|--------|
| devcontainer | implement-complete | Contributor env rebuilt and committed as `19620ca` on feat/devcontainer. Resume with `/resume devcontainer` → `/test devcontainer` → `/finalize devcontainer`. Will need conflict resolution against main's newer `.gitattributes`/`README.md`. | feat/devcontainer |
