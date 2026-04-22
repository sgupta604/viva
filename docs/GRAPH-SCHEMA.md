# graph.json — Locked Contract

This is the **single source of truth** for the `graph.json` format emitted by the
crawler and consumed by the viewer. Both sides MUST derive their types from this
document. Schema changes require a **foundation stream** — crawler and viewer
update in lockstep.

## Schema Versions

| Version | Status | Notes |
|---------|--------|-------|
| `1` | legacy-read | Viewer still accepts; crawler no longer emits. Missing fields are upgrade-shimmed (empty `clusters[]`, default `generated=false`). |
| `2` | current | Crawler emits exclusively. Adds `clusters[]`, widened edge kinds, generated-file flags, edge `attrs`, classified `unresolved` prefixes. |

The crawler always emits `version: 2`. The viewer's zod schema discriminates by
`version` and upgrades v1 inputs transparently so users with stale `graph.json`
on disk can still open the viewer without a crawler re-run.

## Key Reference (JSON camelCase ↔ Python snake_case)

Python dataclasses use snake_case; JSON at the boundary is camelCase. The
`to_dict()` method performs the conversion. Mismatches bit us in
xml-viewer-hardening post-finalize — consult this table when touching emit.py.

| JSON (camelCase) | Python (snake_case) | Type | Where |
|------------------|---------------------|------|-------|
| `generatedAt` | `generated_at` | str \| None | Graph |
| `parseError` | `parse_error` | str \| None | FileNode |
| `sizeBytes` | `size_bytes` | int | FileNode |
| `isTest` | `is_test` | bool | FileNode |
| `generatedFrom` | `generated_from` | str \| None | FileNode (v2) |
| `childFiles` | `child_files` | list[str] | ClusterNode (v2) |
| `childClusters` | `child_clusters` | list[str] | ClusterNode (v2) |

## Top-level shape (v2)

```json
{
  "version": 2,
  "root": "sample-module",
  "generatedAt": "2026-04-22T05:00:00Z",
  "files": [ { ... } ],
  "edges": [ { ... } ],
  "clusters": [ { ... } ],
  "parseErrors": [ ]
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `version` | integer | yes | `2` for current emissions. Viewer accepts `1` via upgrade shim. |
| `root` | string | yes | POSIX path or display name of the crawled root. Informational. |
| `generatedAt` | string (ISO-8601 UTC) | no | Omitted when crawler is run with `--no-timestamp`. |
| `files` | FileNode[] | yes | Sorted by `path` ascending. |
| `edges` | Edge[] | yes | Sorted by `(source, kind, target, unresolved)` ascending (nulls last). |
| `clusters` | ClusterNode[] | yes (v2) | Always present, empty array when no files. See ClusterNode. |
| `parseErrors` | ParseError[] | no | Structured parse-error list (optional). |

## ClusterNode (v2)

```json
{
  "path": "base-config/docstorage/global",
  "parent": "base-config/docstorage",
  "childFiles": ["a1b2c3d4e5", "f6789abcde"],
  "childClusters": ["base-config/docstorage/global/gradients"],
  "kind": "folder"
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `path` | string | yes | POSIX path relative to crawl root. Unique across `clusters[]`. |
| `parent` | string \| null | yes | Parent cluster `path`; null for top-level clusters. |
| `childFiles` | string[] | yes | File ids directly in this cluster (NOT recursive). |
| `childClusters` | string[] | yes | Child cluster paths (NOT recursive). |
| `kind` | `"folder"` \| `"d-aggregate"` | yes | Renderer hint; see `.d/` detection rule below. |

### `.d/` detection rule (kind = `d-aggregate`)

A cluster is classified `"d-aggregate"` when **BOTH** conditions hold:

1. The directory name ends in `.d` (e.g. `parameters.d`, `resolve.d`).
2. There is a sibling file with matching stem (e.g. `parameters.d/` alongside
   `parameters.xml`). The sibling must be a parsed file in `files[]`.

If only one side is present (orphan `.d/` dir or orphan sibling file), the
cluster stays plain `"folder"`. This guards against false positives like
`node_modules/something.d/` that happen to share a suffix but have no pairing.

## FileNode (v2 additions)

```json
{
  "id": "a1b2c3d4e5",
  "path": "config/radar.xml",
  "name": "radar.xml",
  "folder": "config",
  "kind": "xml",
  "sizeBytes": 1024,
  "params": [ ... ],
  "parseError": null,
  "isTest": false,
  "generated": false,
  "generatedFrom": null
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | string | yes | **Stable ID:** first 10 hex chars of SHA-1(POSIX path relative to root). |
| `path` | string | yes | POSIX-normalized path relative to `root` (forward slashes only, TR9). |
| `name` | string | yes | Final path segment. |
| `folder` | string | yes | Parent folder (POSIX path relative to root); empty string if root. |
| `kind` | `"xml"` \| `"yaml"` \| `"json"` \| `"ini"` | yes | Parser family. |
| `sizeBytes` | integer | yes | File size in bytes. |
| `params` | ParamNode[] | yes | Flattened dotted-key parameter list. May be empty on parseError. |
| `parseError` | string \| null | yes | Null if parsed cleanly; human-readable error message otherwise. |
| `isTest` | boolean | yes | True when path starts with `tests/` or contains a `/tests/` segment. Drives default "hide tests" filter. |
| `generated` | boolean | yes (v2) | True **only** when explicitly listed in a detected templating manifest. Default `false`. No heuristic inference. |
| `generatedFrom` | string \| null | yes (v2) | POSIX path of manifest that listed this file. Null when `generated=false`. |

### Generated-file semantics (v2)

The crawler scans for templating manifests (exact filename match, initially
`templating_config.yaml` with a top-level `outputs:` list). Files listed by
relative path in such a manifest get `generated=true` + `generatedFrom=<manifest path>`.

- **No glob inference.** The manifest must list the file explicitly.
- **No-op when no manifest found.** Zero files flagged on a typical codebase
  without templating.
- **Absent files in manifest are ignored.** Not an error.

### Partial-parse semantics

When `parseError` is non-null, `params` and `raw_refs` MAY still be populated with
content extracted by the recoverable parser. Consumers should render both: the
error string informs the user that parsing was imperfect, while any recovered
params and refs remain useful for navigation. There is no separate "partial"
flag — the presence of a non-null `parseError` alongside populated arrays is
the signal.

## ParamNode

```json
{
  "key": "radar.threshold_rain",
  "value": "0.25",
  "kind": "scalar",
  "line": 7
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `key` | string | yes | Dotted key (`section.subsection.name` or `element.attribute`). |
| `value` | string | yes | Stringified value. See "Value stringification" below. |
| `kind` | `"scalar"` \| `"list"` \| `"map"` | yes | Structural hint. |
| `line` | integer \| null | yes | 1-based line in source file; null if unknown. |

### Value stringification

- **scalar** — raw string form (booleans, numbers, strings all stringify).
- **list** / **map** — JSON-ish preview, truncated at **depth = 2**. Deeper content
  is replaced with the literal marker `"..."`. Example: a 3-level-deep map becomes
  `{"a":{"b":"..."}}`. The `kind` field tells the viewer how to render.
- Strings never contain embedded newlines in the preview; newlines are replaced
  with spaces.

## Edge (v2)

```json
{
  "source": "a1b2c3d4e5",
  "target": "f6789abcde",
  "kind": "include",
  "unresolved": null,
  "attrs": { "order": 1 }
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `source` | string (FileNode id) | yes | The file that emits the reference. |
| `target` | string (FileNode id) \| null | yes | Null when unresolved. |
| `kind` | `"include"` \| `"ref"` \| `"import"` \| `"xsd"` \| `"d-aggregate"` \| `"logical-id"` | yes | Reference family (see below). Widened in v2. |
| `unresolved` | string \| null | yes | Raw reference string when target is null; otherwise null. May carry a classification prefix (see below). |
| `attrs` | object | no (v2) | Edge metadata. Currently only `order: int` for `.d/` load order. Omitted if empty. |

### Reference kinds

- **`include`** — `<include file="..."/>` (XML) or `!include` (YAML) or `{"$include":"..."}` (JSON). Points at another file.
- **`ref`** — `<ref id="some.key"/>` (XML) — points at a param id, which is
  resolved to the file that defines it.
- **`import`** — `<import path="..."/>` or path-style imports that target a file.
- **`xsd`** (v2) — XSD validation reference extracted from `xsi:schemaLocation`
  (namespace → location pairs) or `xsi:noNamespaceSchemaLocation`. Target is the
  referenced `.xsd` file. An XSD never self-references; if the source file path
  ends in `.xsd` the edge is suppressed.
- **`d-aggregate`** (v2) — synthetic edge from a file `foo.xml` to every child
  of its sibling `foo.d/` directory. Encodes the drop-in configuration pattern.
  Carries `attrs.order` when the child filename begins with a numeric prefix
  (regex `^(\d+)[-_]`), preserving load order.
- **`logical-id`** (v2) — cross-file reference resolved by attribute-declared
  logical IDs. See "Logical-ID resolution" below.

### Resolution precedence (include / ref / import)

For each raw reference the crawler tries, in order:

1. **Path-based** — if the raw ref looks like a relative or absolute path,
   normalize it to POSIX and match against a known file path.
2. **Local id** — search the source file's declared ids/keys first.
3. **Global id** — search all files for a param with matching key.
4. **Unresolved** — if none match, emit an edge with `target=null` and the raw
   string in `unresolved`. If multiple global matches would apply, the edge is
   also unresolved with `unresolved` prefixed `"ambiguous:"`.

### Logical-ID resolution (v2)

Logical-IDs must be **explicitly declared** — no glob inference, no
filename-matching.

1. **Declarer whitelist.** The crawler captures declared IDs only on elements
   in a known-declarer tag set. Initial whitelist: `param`, `entry`, `item`,
   `catalogue`, `scheme`. Declaring attribute names: `id`, `model-id`, `scheme`,
   `name`.
2. **Reference capture.** Any element referencing `id="..."` on a referrer-tag
   (e.g. `ref`, `use`, `link`) contributes a raw ref.
3. **Specificity cap.** The following declared IDs are skipped:
   - Purely numeric (e.g. `id="1"`).
   - Single character (e.g. `id="x"`).
   - Declared in more than N files, where N is configurable via
     `--logical-id-max-cardinality=INT` (default **20**). When capped, the ID
     is dropped and logged in diagnostics — the ID contributes **zero** edges.
4. **Resolution.** For each (referrer, referenced-id) pair, emit one edge
   `kind="logical-id"` per declarer file. When no declarer exists, emit
   unresolved.

### Unresolved classification prefixes (v2)

The `unresolved` field may carry a classification prefix when useful:

| Prefix | Meaning | Example |
|--------|---------|---------|
| `fallback:<href>` | XInclude target missing but a sibling `xi:fallback` was declared. Not a parse error — intended behavior. | `fallback:missing.xml` |
| `ambiguous:<tail>` | Multiple candidates matched (path tail collision); crawler refused to guess. | `ambiguous:schema.xsd` |
| *(no prefix)* | Plain unresolved — target genuinely missing with no fallback or ambiguity. | `really-missing.xml` |

### `.d/` load-order attr

For `d-aggregate` edges, when the child filename matches `^(\d+)[-_]` the
crawler writes `attrs.order = int(prefix)`. Children without numeric prefix
have no `order` attr (lexical order implicit).

## Where-used highlighting rule (viewer)

When a user selects a param with key `K`:

- **Strong highlight** — files connected by an edge whose `kind` is `ref` and
  whose resolved target's params include `K`. These are real, edge-confirmed
  usages.
- **Muted highlight** — files that contain a param with key `K` but are not
  edge-connected to the selection. These are name-only matches (advisory, may
  be coincidence).

## Windows path normalization (TR9)

- All `path` and `folder` fields are POSIX (`/` only).
- The crawler uses `pathlib.PurePosixPath` when serializing.
- The viewer never has to normalize — the contract guarantees `/`.

## Determinism

- `files[]` sorted by `path` (ASCII ascending).
- `params[]` within each file sorted by `key` (ASCII ascending).
- `edges[]` sorted by `(source, kind, target, unresolved)` ascending. Nulls sort
  last.
- `clusters[]` sorted by `path` ascending.
- JSON serialization uses `sort_keys=True`, `indent=2`, trailing newline (LF).
- With `--no-timestamp`, two consecutive runs on the same input produce
  byte-identical output (SHA-256 equal). Includes `clusters[]` and all v2
  additions.

## Fixture lockstep

`crawler/tests/fixtures/sample-module.expected.graph.json` and
`viewer/e2e/fixtures/graph.json` MUST be **byte-identical**. CI (and `/test`)
verify this. Either:

- Regenerate both from the crawler against `sample-module` with
  `--no-timestamp`, or
- Edit them in lockstep by hand.

## Non-goals (explicit)

- **Heuristic / filename-glob fuzzy ref matching.** Edges must have an explicit
  anchor. Follow-up if warranted.
- **XPointer fragment resolution** on XInclude hrefs.
- **Jinja2 / templating introspection.** We only mark files as `generated` from
  explicit manifest listings — we do not parse templates or trace variables.
- **Shell scripts / binary files as first-class graph nodes.** They can appear
  as string targets in `unresolved` but get no FileNode. Revisit as
  "non-config nodes" follow-up.

## JSON Schema (informal, v2)

```ts
interface Graph {
  version: 2;
  root: string;
  generatedAt?: string;
  files: FileNode[];
  edges: Edge[];
  clusters: ClusterNode[];
  parseErrors?: ParseError[];
}
interface FileNode {
  id: string;
  path: string;
  name: string;
  folder: string;
  kind: "xml" | "yaml" | "json" | "ini";
  sizeBytes: number;
  params: ParamNode[];
  parseError: string | null;
  isTest: boolean;
  generated: boolean;               // v2
  generatedFrom: string | null;     // v2
}
interface ParamNode {
  key: string;
  value: string;
  kind: "scalar" | "list" | "map";
  line: number | null;
}
interface Edge {
  source: string;
  target: string | null;
  kind: "include" | "ref" | "import" | "xsd" | "d-aggregate" | "logical-id";
  unresolved: string | null;        // may carry prefix "fallback:" / "ambiguous:"
  attrs?: { order?: number };       // v2
}
interface ClusterNode {
  path: string;
  parent: string | null;
  childFiles: string[];
  childClusters: string[];
  kind: "folder" | "d-aggregate";
}
```
