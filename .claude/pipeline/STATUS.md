# Pipeline Status

**Updated:** 2026-04-21

## Active

| Field | Value |
|-------|-------|
| Feature | — idle — |
| Phase | — |
| Next | — |

## Reminders (surface when user returns)

- Fresh-repo migration (clean history, no Claude attribution) still on deck.
- Deferred follow-up branch now due: **smart static analysis** — dead-param detection, orphan refs, cycle detection, cross-file schema inference ("replace-an-LLM" ambition). Waiting for user to kick the tires on the new xml-viewer-hardening baseline before scoping.
- Plan Mode design locked in `.claude/docs/DECISIONS.md`, ready for `/research plan-mode` when there's appetite.
- Product-strategy conversation: extending viva beyond config formats (Tier 1/2/3).

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
