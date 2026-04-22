# PR #1 — Updated Body Draft (paste into GitHub)

**How to use:** the PR body written during /finalize reflects pre-fix-cycle state. Paste this content over it on https://github.com/sgupta604/viva/pull/1 before merging.

---

## Summary

Hierarchical graph viewer for large config codebases — gets viva from "demo tool on 50-file fixtures" to "useful on real 1,000+ file proprietary codebases."

**Two problems solved, reinforcing each other:**

- **Viewer couldn't scale past ~50 nodes.** Dagre-flat layout collapsed to an unreadable vertical column at 1369 nodes (see `.claude/active-work/large-codebase-viewer/screenshots/01-flat-column-at-1369-nodes.png`). Now renders as compound/hierarchical clusters — directories as collapsible nodes, default-collapsed everywhere, expand recursively to drill in.
- **Crawler produced zero edges on real codebases.** The v1 ref resolver knew a handful of explicit patterns and missed the common ones. Added three new edge kinds (`xsd` schema validation refs, `d-aggregate` for `.d/` drop-in directories, `logical-id` for declared-ID matching), producing 600-4000 est. edges on a typical target vs 0 before.

## Performance

- **FPS p95 = 18.00 ms** at 3,000-node synthetic fixture (gate was ≤ 33 ms). 46% headroom.
- Virtualization-by-omission: collapsed clusters' children are omitted from `nodes[]`, not hidden — keeps DOM cost proportional to visible nodes.
- Measured in `viewer/e2e/fps-bench.spec.ts` against generated large fixture.

## What shipped

### graph.json v2 (schema foundation)

- New top-level `clusters[]` array with `path`, `parent`, `childFiles`, `childClusters`.
- New edge kinds: `xsd`, `d-aggregate`, `logical-id` (existing `include` / `import` / `ref` preserved).
- `generated: bool` on files when a templating manifest identifies template-produced output.
- `xi:fallback` classified as `unresolved` instead of hard error.
- v1 graph.json still consumed correctly (backward compatible via zod discriminated union).

### Crawler

- **XSD refs:** `xsi:schemaLocation` and `xmlns` bindings → `xsd` edges.
- **`.d/` aggregation:** parent config gets synthetic edges to each child in `*.d/`; numeric prefix preserved as load-order metadata.
- **Logical-ID linking:** scan for declared `model-id` / `scheme` / similar attributes; emit `logical-id` edges when referenced. Deliberately narrow — no heuristic filename globs (user's "edges I can trust" principle).
- **xi:fallback tolerance:** dangling hrefs no longer crash parse.
- **Template-generated detection:** when a templating manifest is detectable, files produced from it are flagged so the graph distinguishes generated from hand-authored.
- **Dogfood re-crawl invariant:** crawling the same repo twice produces byte-identical output (regression guard from xml-viewer-hardening sidecar-feedback-loop).

### Viewer

- **`hierarchyStore.ts`** Zustand slice (respects `DECISIONS.md` modular-stores boundary).
- **ClusterNode component** — compound/folder node with child-count badge using `totalDescendantFiles`.
- **Recursive layout** — two-pass bottom-up measure + top-down place; expanded descendants get their spatial footprint reserved before siblings place.
- **elkjs + Web Worker integration skeleton** — present and wired, kept as fallback; sync grid-pack currently carries the FPS budget.
- **Nested cluster rendering** (promoted from "v2.1 enhancement" to in-scope after user review).
- **Cross-cluster edge aggregation** with counts; edges retarget to nearest visible ancestor.
- **Folder filter is now NAVIGATE, not HIDE** — expand-to-path + fitBounds; sibling context preserved.
- **`.d/` collapse-as-single-node** with dashed-border visual distinction.
- **Generated-vs-authored badge** when the flag is set.
- **Auto-descend on single-child root** when the crawl root has only one child cluster (common for `base-config/`-style repos).
- **Edge label contrast polish** — opaque rounded backgrounds + glyph stroke so labels don't visually bleed onto sibling cluster borders.
- **minZoom floor raised** from 0.05 to 0.2 — prevents the graph from collapsing into an unreadable speck at extreme zoom-out.

## Testing

- Crawler: **112 pytest + 11 integration** (scale + dogfood re-crawl invariant).
- Viewer: **109 Vitest** (layout, hierarchy, descendants, store).
- Playwright: **42 specs** including fps-bench (17.80 → 18.00 ms post-polish), overlap-non-intersect, badge-non-zero, content-correctness (expanded cluster reveals children, folder dropdown shifts viewport, edges render as SVG paths).
- Programmatic scale-verify script (`viewer/scripts/visual-verify-scale.mjs`) — 5 layout invariants on 3k fixture, all pass.
- Build: succeeds; Monaco chunk remains lazy.
- Offline guarantee: elkjs bundled locally, no external network on runtime. Confirmed by `offline.spec.ts`.

## Post-finalize fixes (this branch history)

The initial /finalize opened this PR with automated tests all green, but visual review on viva-on-viva surfaced UX bugs. Three additional fix cycles landed before this version:

| Commit | Fix |
|--------|-----|
| `256c331` | Render nested clusters, retarget edges to nearest visible ancestor, real fitBounds on jump-to-folder |
| `a894147` | Resolve cluster-layout blockers — two-pass layout fixes sibling-overlap on grandchild expand; badge shows `totalDescendantFiles` not `directFiles.length` |
| `d544017` | Polish — minZoom floor + edge-label contrast at scale |

Full session narrative: `.claude/active-work/large-codebase-viewer/session-log.md`.

## Test plan

```powershell
# Clone + checkout
git fetch origin
git checkout feat/large-codebase-viewer

# On viva itself (quick sanity)
Remove-Item -Recurse -Force viewer/public/source, viewer/public/graph.json -ErrorAction SilentlyContinue
python -m crawler . --out viewer/public/graph.json
cd viewer
npm install
npm run dev
# open http://localhost:5173 — expect 2 top-level clusters (crawler, viewer) with non-zero badges (crawler ≥ 40, viewer ≥ 100)
```

Then on your real company codebase (inside Coder instance):

```bash
# Force-pull the image built from this branch, OR build locally:
docker build -t viva:lcv https://github.com/sgupta604/viva.git#feat/large-codebase-viewer
docker run --rm -v "$(pwd):/target:ro" -p 5173:5173 viva:lcv
```

Expected: default collapsed, click to drill, edges visible, folder dropdown navigates to selected cluster, no empty tiles, no overlap.

## Deferred to future branches

- Heuristic / filename-glob fuzzy ref matching (user deliberately kept v1 edges explicit-only).
- XPointer fragment resolution on xi:include hrefs.
- Jinja2 templating introspection (beyond the generated/authored flag).
- elkjs-as-primary layout (currently skeleton; grid-pack handles actual layout).
- Rendering shell/binary files as leaf nodes.
- Logical-ID whitelist CLI flag.
- Multi-line zoom-based minimap for truly enormous codebases.

## Screenshots

Attached for reviewers:
- `.claude/active-work/large-codebase-viewer/screenshots/01-flat-column-at-1369-nodes.png` (before — original pain point)
- `.claude/active-work/large-codebase-viewer/screenshots/05-post-blocker-fix-03-drill-deeper.png` (after — nested cluster expansion on viva)
- `.claude/active-work/large-codebase-viewer/screenshots/06-scale-verify-02-top-expanded.png` (after — 3k scale, top-level expanded, no overlap)
- `.claude/active-work/large-codebase-viewer/screenshots/07-polish-edge-labels.png` (after polish — edge label contrast)
