# Pipeline Status

**Updated:** 2026-04-22 (overnight autonomous run complete)

## Active

_(idle — awaiting human review)_

## ⭐ START HERE (morning pickup)

**Open PR #1** https://github.com/sgupta604/viva/pull/1 — ship-ready state after overnight fix cycle.

1. **Update PR body:** paste `.claude/features/large-codebase-viewer/PR-BODY.md` over the existing PR description (the pre-fix body no longer reflects reality).
2. **Read** `.claude/active-work/large-codebase-viewer/session-log.md` (local-only, gitignored) for the full overnight narrative — what broke, what fixed it, test-coverage lessons.
3. **Test locally** per PR-BODY.md's test plan — viva first, then your Coder-instance company codebase.
4. **Merge when happy.** Main is clean; branch is 27 commits ahead.

## Reminders

- Fresh-repo migration (clean history, no Claude attribution) still on deck. High blast radius — user-driven.
- Plan Mode design locked in `.claude/docs/DECISIONS.md`, ready for `/research plan-mode` when appetite.
- Product-strategy conversation: extending viva beyond config formats (Tier 1/2/3).
- **v2.1 queue for large-codebase-viewer** (flagged during overnight session, captured in session-log.md):
  - Heuristic / fuzzy ref matching (filename-glob inference)
  - XPointer fragment resolution on xi:include hrefs
  - Jinja2 templating introspection (beyond current generated/authored flag)
  - elkjs-as-primary layout promotion (currently sync grid-pack carries; elkjs skeleton only)
  - Logical-ID whitelist CLI flag
  - Collapsed-cluster internal-activity badge (intra-cluster edges silently drop today)
  - Rendering shell/binary files as leaf nodes
  - Promoting `viewer/scripts/visual-verify*.mjs` to CI pre-merge gate, or discarding

## Queue

_(empty — up to user to decide what's next after merge)_

## Completed

| Feature | Date | PR / Merge |
|---------|------|----|
| large-codebase-viewer | 2026-04-22 | [PR #1](https://github.com/sgupta604/viva/pull/1) open (27 commits), **ship-ready, awaiting review** |
| xml-viewer-hardening | 2026-04-21 | merged to main (fast-forward, 14 commits, tip `d1ed38b`) |
| v1-demo | 2026-04-18 | merged to main |
| runtime-image | 2026-04-18 | merged to main |
| ghcr-publish | 2026-04-18 | merged to main |

## Parked

| Feature | Phase | Reason | Branch |
|---------|-------|--------|--------|
| devcontainer | implement-complete | Contributor env rebuilt on feat/devcontainer (`19620ca`). Resume → `/test` → `/finalize`. Will need conflict resolution against main's newer `.gitattributes`/`README.md`. | feat/devcontainer |

## Overnight session summary (context)

- Started: PR #1 at 23 commits, automated tests all green, but visual review found 5 apparent UX bugs.
- Ran 3 fix cycles: diagnose → fix-1 → visual-verify-1 (BLOCKED on 2 new issues) → fix-2 → scale-verify-at-3k (SHIP-AT-SCALE) → polish.
- Net commits added overnight: 4 (MCP registration + 3 fix/polish).
- Final: 112 pytest + 109 Vitest + 42 Playwright green; FPS p95 = 18.00ms on 3k-node fixture (gate 33ms).
- User's explicit acceptance criteria (no overlap / pretty / scalable to "ginormous codebase") all verified programmatically + screenshot evidence.
- Full narrative: `.claude/active-work/large-codebase-viewer/session-log.md`.
