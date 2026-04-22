# Pipeline Status

**Updated:** 2026-04-21

## Active

| Field | Value |
|-------|-------|
| Feature | xml-viewer-hardening |
| Phase | post-diagnose-fix-applied |
| Next | Awaiting user eyeball on `feat/xml-viewer-hardening` (pushed). Two new commits: `dd2f273 fix(crawler): exclude --emit-sources output subtree from walk` + `26f948f fix(viewer): pin FileNode width to dagre layout constant`. Crawler 69/69 green (incl. new twice-crawl regression test), viewer 50/50 green (incl. new FileNode width test), lint/typecheck/build clean. After user confirms the graph looks clean, they merge the PR. |

## Reminders (surface when user returns)

- Fresh-repo migration (clean history, no Claude attribution) still on deck.
- Deferred follow-up branch after this lands: **smart static analysis** — dead-param detection, orphan refs, cycle detection, cross-file schema inference ("replace-an-LLM" ambition). Not in the current branch.
- Plan Mode design locked in `.claude/docs/DECISIONS.md`, ready for `/research plan-mode` when there's appetite.
- Product-strategy conversation: extending viva beyond config formats (Tier 1/2/3).

## Locked Decisions

See `.claude/docs/DECISIONS.md` for design decisions made for future work (currently: viewer state mgmt, Plan Mode data model). Append-only, in-repo, portable across machines.

## Queue

_(empty)_

## Completed

| Feature | Date | PR |
|---------|------|----|
| xml-viewer-hardening | 2026-04-21 | (see PR link once merged) |
| v1-demo | 2026-04-18 | merged to main |
| runtime-image | 2026-04-18 | merged to main |
| ghcr-publish | 2026-04-18 | merged to main |

## Parked

| Feature | Phase | Reason | Branch |
|---------|-------|--------|--------|
| devcontainer | implement-complete | Contributor env rebuilt and committed as `19620ca` on feat/devcontainer. Resume with `/resume devcontainer` → `/test devcontainer` → `/finalize devcontainer`. Will need conflict resolution against main's newer `.gitattributes`/`README.md`. | feat/devcontainer |
