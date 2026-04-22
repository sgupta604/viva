# Viewer Visual Review — Human Checklist

This is the lightweight, human-facing version of the per-feature checklist. The full template that the test-agent populates per-feature lives at `.claude/templates/visual-review.md`; once populated for an in-flight feature it lands at `.claude/active-work/<feature>/visual-review.md`.

**When to use this:** every time a viewer feature touches `viewer/src/components/graph/**` or `viewer/src/components/views/**`. After `/test` PASS, before approving `/finalize`. See `.claude/pipeline/WORKFLOW.md` §5.0 for the gate definition.

**Why this exists:** programmatic visual checks (`viewer/scripts/visual-verify*.mjs`, FPS percentiles, bounding-box overlap) cannot detect labels on borders, edges under fills, or unexplained color palettes. A human eyeball is the only reliable detector for that regression class. Reference: `.claude/features/tree-layout-redesign/2026-04-22T00-00-00_research.md` §"Visual-review process recommendation".

## How to do a review

1. Open the populated review file at `.claude/active-work/<feature>/visual-review.md`.
2. Open every screenshot listed in its manifest. Look at it — do not assume what the description says is true.
3. Walk this checklist against every screenshot. Mark ❌ on the first failing item; do NOT keep going to find more — one failure blocks the gate.
4. Record the decision in the **Approval** table at the bottom of the per-feature file.
5. If approved, tell the orchestrator "looks good" (or "ship it" / "approved"). Only then will it suggest `/finalize`.
6. If blocked, point at the specific screenshot ID + checklist item that failed. The orchestrator will route to `/diagnose <feature>` or `/quickfix <desc>`.

## The 10 items

1. **No edges run behind node fills.** Edge stroke must be visibly above any cluster/file box it crosses, at 100% zoom.
2. **Edge labels are readable at 100% zoom.** Contrast holds; no glyph crashes a cluster border.
3. **Either one neutral color OR a visible legend explains every edge color.** Multiple colors without a legend = fail.
4. **Layout-mode toggle works.** Clicking it flips the view immediately. Expand/collapse state survives the swap.
5. **Default-on-load matches the documented default.** For `tree-layout-redesign`: tree mode after `localStorage.clear()`.
6. **Aggregated `×N` labels render at scale.** Always visible (no hover required); count is correct against the source data.
7. **No label overlap with cluster borders** at the captured zoom.
8. **Dark-mode contrast holds.** Text is readable against the background; no muddy fills hiding chrome.
9. **Pan / zoom feels at 60fps** on the 3k-node fixture. Defer to FPS bench numbers if subjective judgment is uncertain — `viewer/e2e/fps-bench.spec.ts` enforces p95 < 33ms.
10. **No console errors** in the screenshot, in attached browser logs, or in the test-agent's report.
