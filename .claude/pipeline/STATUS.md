# Pipeline Status

**Updated:** 2026-04-18

## Active

| Field | Value |
|-------|-------|
| Feature | none — next feature queued: ghcr-publish (auto-publish runtime image to GitHub Container Registry so end users can `docker pull` without building) |
| Phase | - |
| Next | `/research ghcr-publish` |
| Branch | - |

## Queue

| Feature | Priority | Notes |
|---------|----------|-------|
| ghcr-publish | high | GitHub Actions workflow to build and push runtime image to ghcr.io/sgupta604/viva on release tags. Runtime image is not useful to end users until it is pullable without a local build. |

## Completed

| Feature | Date | PR |
|---------|------|----|
| v1-demo | 2026-04-18 | https://github.com/sgupta604/viva/compare/main...feat/v1-demo?expand=1 |
| runtime-image | 2026-04-18 | https://github.com/sgupta604/viva/compare/feat/v1-demo...feat/runtime-image?expand=1 |

## Parked

| Feature | Phase | Reason | Branch |
|---------|-------|--------|--------|
| devcontainer | implement-complete | Paused in favor of runtime-image (end-user tool took priority over contributor env). Rebuilt and committed as `19620ca` on feat/devcontainer. Resume with `/resume devcontainer` → `/test devcontainer` → `/finalize devcontainer`. Note: has overlapping .gitattributes/README.md edits that will need reconciliation at integration time. | feat/devcontainer |
