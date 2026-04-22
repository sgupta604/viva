# Pipeline Status

**Updated:** 2026-04-22

## Active

_(idle)_

## Reminders (surface when user returns)

- Fresh-repo migration (clean history) still on deck.
- Plan Mode design locked in `.claude/docs/DECISIONS.md`, ready for `/research plan-mode` when there is appetite.
- Product-strategy conversation: extending viva beyond config formats (Tier 1/2/3).
- v2.1 queue for large-codebase-viewer: nested cluster multi-level rendering, heuristic/fuzzy ref matching, XPointer fragment resolution, Jinja2 introspection, elkjs-as-primary-layout promotion, logical-ID whitelist CLI flag. These dovetail with the smart-static-analysis and replace-an-LLM follow-up themes.

## Queue

_(empty)_

## Completed

| Feature | Date | PR / Merge |
|---------|------|----|
| large-codebase-viewer | 2026-04-22 | PR open on feat/large-codebase-viewer (22 commits); user reviews and merges |
| xml-viewer-hardening | 2026-04-21 | merged to main (fast-forward, 14 commits, tip `d1ed38b`) |
| v1-demo | 2026-04-18 | merged to main |
| runtime-image | 2026-04-18 | merged to main |
| ghcr-publish | 2026-04-18 | merged to main |

## Parked

| Feature | Phase | Reason | Branch |
|---------|-------|--------|--------|
| devcontainer | implement-complete | Contributor env rebuilt and committed as `19620ca` on feat/devcontainer. Resume with `/resume devcontainer` → `/test devcontainer` → `/finalize devcontainer`. Will need conflict resolution against main's newer `.gitattributes`/`README.md`. | feat/devcontainer |
