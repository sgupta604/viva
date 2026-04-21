# Pipeline Status

**Updated:** 2026-04-20

## Active

| Field | Value |
|-------|-------|
| Feature | quickfix in flight: node-overlap + read-only hint (viewer/) |
| Phase | implement (general-purpose agent) |
| Next | After quickfix lands → discuss remaining bugs from user's design doc. Plan Mode is the next big feature (`/research plan-mode`) — design decisions already locked in `.claude/docs/DECISIONS.md`. First-publish step (GHCR public visibility) still pending if not yet done. |
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
