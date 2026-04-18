# Pipeline Status

**Updated:** 2026-04-18

## Active

| Field | Value |
|-------|-------|
| Feature | none — v1 + runtime + publish pipeline complete. USER ACTION REQUIRED: see `docs/RELEASE.md` Section 1 for first-publish manual step (flip GHCR package to Public or all docker pull calls return 403/404). |
| Phase | - |
| Next | merge feat/v1-demo → feat/runtime-image → feat/ghcr-publish in order, then flip GHCR visibility |
| Branch | - |

## Queue

_(empty)_

## Completed

| Feature | Date | PR |
|---------|------|----|
| v1-demo | 2026-04-18 | https://github.com/sgupta604/viva/compare/main...feat/v1-demo?expand=1 |
| runtime-image | 2026-04-18 | https://github.com/sgupta604/viva/compare/feat/v1-demo...feat/runtime-image?expand=1 |
| ghcr-publish | 2026-04-18 | https://github.com/sgupta604/viva/compare/feat/runtime-image...feat/ghcr-publish?expand=1 |

## Parked

| Feature | Phase | Reason | Branch |
|---------|-------|--------|--------|
| devcontainer | implement-complete | Paused in favor of runtime-image (end-user tool took priority over contributor env). Rebuilt and committed as `19620ca` on feat/devcontainer. Resume with `/resume devcontainer` → `/test devcontainer` → `/finalize devcontainer`. Note: has overlapping .gitattributes/README.md edits that will need reconciliation at integration time. | feat/devcontainer |
