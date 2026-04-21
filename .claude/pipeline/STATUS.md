# Pipeline Status

**Updated:** 2026-04-21

## Active

| Field | Value |
|-------|-------|
| Feature | — |
| Phase | — |
| Next | Queued: (1) `/research xml-ref-resolver` — user reports XML reference resolution misses patterns in their real codebase; (2) Plan Mode design decisions locked in `.claude/docs/DECISIONS.md`, ready for `/research plan-mode` when there's appetite; (3) product-strategy conversation: extending viva beyond config formats (Tier 1 cheap config formats vs Tier 2 shallow code-as-config vs Tier 3 full code understanding — see chat). First-publish step (GHCR public visibility) still pending if not yet done. |
| Branch | main |

## Locked Decisions

See `.claude/docs/DECISIONS.md` for design decisions made for future work (currently: viewer state mgmt, Plan Mode data model). Append-only, in-repo, portable across machines.

## Queue

_(empty)_

## Completed

| Feature | Date | PR |
|---------|------|----|
| v1-demo | 2026-04-18 | merged to main |
| runtime-image | 2026-04-18 | merged to main |
| ghcr-publish | 2026-04-18 | merged to main |

## Parked

| Feature | Phase | Reason | Branch |
|---------|-------|--------|--------|
| devcontainer | implement-complete | Contributor env rebuilt and committed as `19620ca` on feat/devcontainer. Resume with `/resume devcontainer` → `/test devcontainer` → `/finalize devcontainer`. Will need conflict resolution against main's newer `.gitattributes`/`README.md`. | feat/devcontainer |
