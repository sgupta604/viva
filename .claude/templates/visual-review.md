<!--
  Visual Review template — populated by the test-agent into
  .claude/active-work/<feature>/visual-review.md when a feature touches
  viewer/src/components/graph/** or viewer/src/components/views/**.

  How to use (test-agent):
    1. Copy this file to .claude/active-work/<feature>/visual-review.md
    2. Replace <feature>, <date>, and the screenshot table rows with the
       paths your Playwright run actually produced.
    3. Leave the checklist + approval block intact — that's the human's job.

  How to use (orchestrator):
    1. After /test PASS on a viewer-surface feature, surface this file by
       PATH (don't paste the contents).
    2. Wait for the user's literal "looks good" before suggesting /finalize.
-->

# Visual Review — <feature>

**Date:** <YYYY-MM-DD> | **Status:** awaiting human approval | **Pipeline gate:** WORKFLOW.md §5.0

## Screenshot Manifest

| ID | What it shows | Path | Notes |
|----|---------------|------|-------|
| 1  | Default load (no localStorage) | `viewer/test-results/<spec>/<png>` | Should render the new default layout |
| 2  | After toggle to alternate mode | `viewer/test-results/<spec>/<png>` | Verify toggle round-trip preserved expand state |
| 3  | Edge legend chip visible      | `viewer/test-results/<spec>/<png>` | All 6 EDGE_KIND_META entries present |
| 4  | Direct edge label on hover    | `viewer/test-results/<spec>/<png>` | Hover-only — should NOT be visible without hover |
| 5  | Aggregated `×N` label always-on | `viewer/test-results/<spec>/<png>` | Always visible — count is the signal |
| 6  | 3k-node tree at fit-bounds    | `viewer/test-results/<spec>/<png>` | Overall composition |
| 7  | 3k-node tree at 100% zoom near a dense subgraph | `viewer/test-results/<spec>/<png>` | Per-node legibility |

(Add or remove rows to match what was actually captured. Keep paths relative to repo root.)

## Visual Checklist (10 items — human reviewer)

Walk every screenshot above against this list. Any ❌ blocks `/finalize` and routes to `/diagnose` or `/quickfix`.

- [ ] **No edges run behind node fills.** No edge segment is occluded by a cluster or file box at 100% zoom.
- [ ] **Edge labels are readable at 100% zoom.** Background contrast holds; no text crashes a cluster border.
- [ ] **Either one neutral color OR a visible legend explains every edge color.** Six different colors with no legend = ❌.
- [ ] **Layout-mode toggle works.** Click flips the view immediately; expand state survives the swap.
- [ ] **Default-on-load is the documented default** (tree, for `tree-layout-redesign`). Verified with `localStorage.clear()`.
- [ ] **Aggregated `×N` labels render at scale.** Visible without hover; count is correct.
- [ ] **No label overlap with cluster borders** at the screenshot's zoom level.
- [ ] **Dark-mode contrast holds.** Text readable; no muddy fills hiding chrome.
- [ ] **Pan / zoom feels at 60fps** on the 3k-node fixture (subjective — defer to bench numbers if any frame drops are visible).
- [ ] **No console errors** in the screenshot or attached browser logs.

## Approval

| Reviewer | Date | Decision |
|----------|------|----------|
|          |      | ☐ approved ("looks good") &nbsp; ☐ blocked — see notes |

**Notes (if blocked):**

> _Use this section to record what failed, which screenshot proved it, and what the next pipeline step should be (`/diagnose <feature>` or `/quickfix <desc>`)._
