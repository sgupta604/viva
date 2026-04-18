# Pipeline Status

**Updated:** 2026-04-18

## Active

| Field | Value |
|-------|-------|
| Feature | — |
| Phase | — |
| Next | First-publish: flip GHCR package visibility to Public (see `docs/RELEASE.md` Section 1) |
| Branch | main |

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
