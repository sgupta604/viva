# Target-Repo Profile — EXAMPLE (not universal)

**Source:** separate Claude investigation of the specific company codebase the user was dogfooding against (2026-04-22).

**Read carefully.** This describes **one** real-world target. The user was explicit: _"this is for that specific repo — others could be and probably are different, so keep that in mind."_ Do NOT hardcode anything from this profile into the viewer or crawler. Use it as **evidence of patterns that exist in the wild** so the architecture can accommodate them **generically** — not to build a solution tuned to this one repo.

If the code the research-agent is producing would only work on codebases that look exactly like this one, stop and generalize.

---

## Scale

- ~3,000 files total
- ~1,700 XML files
- Plus XSD, JSON, YAML, shell scripts

At this scale, a naive force-directed or flat DAG layout is unreadable. Design for filtering, hierarchical collapsing, and cluster-level edge aggregation.

## Node types

- XML config files
- XSD schema files
- JSON, YAML
- Shell scripts (referenced but may or may not be nodes — design call)
- Binary/data files (shapefiles under `global/shapefiles/`, regions under `global/areas/`) — referenced by configs but not configs themselves. **Design call:** render as leaf nodes with a distinct style, OR skip. Research should flag the tradeoff.

## Edge sources (in priority order on this repo)

1. **XInclude — `<xi:include href="..." xpointer="..."/>`** — the dominant linking mechanism on this repo.
   - Resolve `href` paths relative to the including file.
   - `xpointer` slices specific nodes inside the target (fragment resolution — flagged as v1 follow-up earlier).
   - `<xi:fallback/>` means the runtime tolerates missing targets. **Parser must not crash on dangling hrefs.** The existing recover-mode parser should already handle this gracefully; verify.

2. **XSD validation refs — `xsi:schemaLocation`, `xmlns`** — ties an XML file to its schema in `xsd/`. Currently not captured by the crawler's ref resolver; new pattern to add.

3. **Logical IDs — `model-id`, `scheme`, filename glob patterns** (e.g. `*PS.557WW_SC.U_DI.C_GP.LIS-...*`).
   - These are NOT file references; they're semantic identifiers that link entries within and across catalogues.
   - Deduping / linking by logical ID is "the most interesting edges semantically" per the user.
   - **Caution:** this edges into fuzzy/inferred territory. v1 viva was explicit-patterns-only by design. Research must decide: where's the line between "scan for declared IDs" (still explicit) and "infer matches" (heuristic — was out of scope)? The user called this out specifically as the "replace-an-LLM" ambition — fair game for this feature, but design the matching so users can understand and trust the edges.

4. **`.d/` drop-in directories** — `parameters.d/`, `resolve.d/`, `catalogue.d/` are auto-aggregated into the parent config at runtime. Numeric prefix on filenames determines load order.
   - **Treat the parent config as having implicit edges to every child in its `.d/` directory.**
   - Viewer should be able to **collapse a `.d/` dir into a single synthetic node** to reduce clutter (user feedback: "collapse .d/ dirs into one node"). Expandable.
   - The numeric prefix carries load-order meaning; preserve as metadata.

## Layout / scope conventions on this repo

- **Tier tree:** `base-config/docstorage/{global,users,groups}/` — three scope tiers: shared / per-user / per-group. Same-named files can exist at multiple tiers and override by precedence.
- **Validation mirror:** `xsd/` mirrors the `docstorage/` tree structure so each config has a schema at a matching path.
- **Templating:** `scripts/templating/` generates configs from `templating_config.yaml` via Jinja2. Some XML files are OUTPUTS, not sources. **The graph should distinguish generated vs hand-authored** — otherwise you're showing derived artifacts as if they were authored, which misleads users making changes.

## Gotchas to plan around

- **Same parameter (e.g. `temperature`) appears across many schemes.** Deduping by logical ID is high-value but non-trivial. Research must decide scope.
- **No symlinks in the codebase** — can assume simple file walks.
- **Drop-in directories at runtime ≠ drop-in at edit time.** The user edits individual files in `.d/`, the runtime aggregates them. Viewer should show both views.

## What this profile is NOT

- It's not a spec. The design target is **any config-heavy codebase**.
- It's not comprehensive — it's one user's dogfood experience, one repo.
- It's not permission to hardcode paths, patterns, or conventions from this repo into viva. Every pattern mentioned here should be handled via **configurable** extraction rules, tier-detection heuristics, or equivalent — not baked in.

## Meta

- User explicitly OK with keeping this intel captured here as reference.
- If more target profiles accumulate, consider promoting to `.claude/docs/TARGET-PROFILES.md` with sub-sections per profile.
