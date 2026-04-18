# graph.json — Locked Contract (v1)

This is the **single source of truth** for the `graph.json` format emitted by the
crawler and consumed by the viewer. Both sides MUST derive their types from this
document. Schema changes require a **foundation stream** — crawler and viewer
update in lockstep.

## Top-level shape

```json
{
  "version": 1,
  "root": "sample-module",
  "generatedAt": "2026-04-18T15:00:00Z",
  "files": [ { ... } ],
  "edges": [ { ... } ]
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `version` | integer | yes | Always `1` for v1. |
| `root` | string | yes | POSIX path or display name of the crawled root. Informational. |
| `generatedAt` | string (ISO-8601 UTC) | no | Omitted when crawler is run with `--no-timestamp`. |
| `files` | FileNode[] | yes | Sorted by `path` ascending. |
| `edges` | Edge[] | yes | Sorted by `(source, kind, target, unresolved)` ascending (nulls last). |

## FileNode

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
  "isTest": false
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

## Edge

```json
{
  "source": "a1b2c3d4e5",
  "target": "f6789abcde",
  "kind": "include",
  "unresolved": null
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `source` | string (FileNode id) | yes | The file that emits the reference. |
| `target` | string (FileNode id) \| null | yes | Null when unresolved. |
| `kind` | `"include"` \| `"ref"` \| `"import"` | yes | Reference family (see "Reference kinds"). |
| `unresolved` | string \| null | yes | Raw reference string when target is null; otherwise null. |

### Reference kinds

- **`include`** — `<include file="..."/>` (XML) or `!include` (YAML) or `{"$include":"..."}` (JSON). Points at another file.
- **`ref`** — `<ref id="some.key"/>` (XML) — points at a param id, which is
  resolved to the file that defines it.
- **`import`** — `<import path="..."/>` or path-style imports that target a file.

### Resolution precedence

For each raw reference the crawler tries, in order:

1. **Path-based** — if the raw ref looks like a relative or absolute path,
   normalize it to POSIX and match against a known file path.
2. **Local id** — search the source file's declared ids/keys first.
3. **Global id** — search all files for a param with matching key.
4. **Unresolved** — if none match, emit an edge with `target=null` and the raw
   string in `unresolved`. If multiple global matches would apply, the edge is
   also unresolved with `unresolved` prefixed `"ambiguous:"`.

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
- JSON serialization uses `sort_keys=True`, `indent=2`, trailing newline (LF).
- With `--no-timestamp`, two consecutive runs on the same input produce
  byte-identical output (SHA-256 equal).

## Fixture lockstep

`crawler/tests/fixtures/sample-module.expected.graph.json` and
`viewer/e2e/fixtures/graph.json` MUST be **byte-identical**. CI (and `/test`)
verify this. Either:

- Regenerate both from the crawler against `sample-module` with
  `--no-timestamp`, or
- Edit them in lockstep by hand.

## JSON Schema (informal)

```ts
interface Graph {
  version: 1;
  root: string;
  generatedAt?: string;
  files: FileNode[];
  edges: Edge[];
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
  kind: "include" | "ref" | "import";
  unresolved: string | null;
}
```
