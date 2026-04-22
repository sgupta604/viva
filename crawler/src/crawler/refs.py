"""Reference resolution.

Precedence for each RawRef:
  1. Path-based: if the raw string looks like a path, resolve against the
     source file's folder (or absolute from root), normalize to POSIX, and
     match against a known file path.
  2. Local id: search params in the source file whose `key` equals the raw.
     (No cross-file edge in this case — just resolved.)
  3. Global id: search all files for a param with matching key. If exactly
     one match, edge to that file. If multiple, emit an unresolved edge with
     reason prefix "ambiguous:".
  4. Unresolved: emit Edge(target=None, unresolved=<raw>).

v2 extensions (large-codebase-viewer):
  - kind="xsd" refs: path-first, then tail-match across all `.xsd` files.
    Tail collisions (two .xsd with the same basename) → ambiguous: prefix.
  - kind="logical-id" refs: link to every file whose logical_id_declarations
    set contains the raw value. Specificity cap: skip pure-integer and
    single-character IDs; cardinality cap: skip IDs declared by > N files
    (configurable via `resolve_references(..., logical_id_max_cardinality=N)`).
  - kind="include" with RawRef.flags ("has_fallback", True): dangling hrefs
    are emitted with `unresolved="fallback:<raw>"` so the viewer can badge
    them as tolerated-missing.
"""
from __future__ import annotations

import posixpath

from .graph import Edge, FileNode

DEFAULT_LOGICAL_ID_MAX_CARDINALITY = 20


def resolve_references(
    files: list[FileNode],
    *,
    logical_id_max_cardinality: int = DEFAULT_LOGICAL_ID_MAX_CARDINALITY,
) -> list[Edge]:
    by_path: dict[str, FileNode] = {f.path: f for f in files}
    by_param_key: dict[str, list[FileNode]] = {}
    local_keys_by_file: dict[str, set[str]] = {}
    for f in files:
        local_keys_by_file[f.id] = {p.key for p in f.params}
        for p in f.params:
            by_param_key.setdefault(p.key, []).append(f)

    # v2: xsd path index by basename for tail-fallback matching. path-relative
    # resolution is still tried first; tail is only used on a miss.
    xsd_files: list[FileNode] = [f for f in files if f.path.endswith(".xsd")]
    xsd_by_tail: dict[str, list[FileNode]] = {}
    for f in xsd_files:
        xsd_by_tail.setdefault(f.name, []).append(f)

    # v2: logical-ID index. id_str -> list of declaring files.
    logical_index: dict[str, list[FileNode]] = {}
    for f in files:
        for lid in f.logical_id_declarations:
            logical_index.setdefault(lid, []).append(f)

    edges: list[Edge] = []
    for src in files:
        src_local_keys = local_keys_by_file[src.id]
        for raw in src.raw_refs:
            if raw.kind == "xsd":
                _resolve_xsd_ref(edges, src, raw, by_path, xsd_by_tail)
                continue
            if raw.kind == "logical-id":
                _resolve_logical_id_ref(
                    edges, src, raw, logical_index, logical_id_max_cardinality,
                )
                continue
            # include / ref / import / d-aggregate fall through to the v1 resolver.
            resolved = _resolve_one(src, raw.raw, by_path, by_param_key, src_local_keys)
            has_fallback = _raw_has_fallback(raw)
            if resolved is None:
                unresolved_val = f"fallback:{raw.raw}" if has_fallback else raw.raw
                edges.append(Edge(
                    source=src.id, target=None, kind=raw.kind,
                    unresolved=unresolved_val,
                ))
            elif isinstance(resolved, str) and resolved.startswith("ambiguous:"):
                edges.append(Edge(source=src.id, target=None, kind=raw.kind, unresolved=resolved))
            elif isinstance(resolved, FileNode):
                edges.append(Edge(source=src.id, target=resolved.id, kind=raw.kind, unresolved=None))
    return edges


def _raw_has_fallback(raw) -> bool:
    if raw.flags is None:
        return False
    for k, v in raw.flags:
        if k == "has_fallback" and v:
            return True
    return False


def _resolve_xsd_ref(
    edges: list[Edge],
    src: FileNode,
    raw,
    by_path: dict[str, FileNode],
    xsd_by_tail: dict[str, list[FileNode]],
) -> None:
    """XSD resolver — path-relative first, then tail-match fallback.

    Ambiguous tail (multiple .xsd candidates with same basename) → unresolved
    with `ambiguous:<tail>` prefix per Risk #4.
    """
    candidates = _candidate_paths(src, raw.raw)
    for c in candidates:
        if c in by_path:
            edges.append(Edge(source=src.id, target=by_path[c].id, kind="xsd", unresolved=None))
            return
    # tail match
    tail = raw.raw.rsplit("/", 1)[-1]
    matches = xsd_by_tail.get(tail, [])
    if len(matches) == 1:
        edges.append(Edge(source=src.id, target=matches[0].id, kind="xsd", unresolved=None))
        return
    if len(matches) > 1:
        edges.append(Edge(
            source=src.id, target=None, kind="xsd",
            unresolved=f"ambiguous:{tail} ({len(matches)} matches)",
        ))
        return
    edges.append(Edge(source=src.id, target=None, kind="xsd", unresolved=raw.raw))


def _resolve_logical_id_ref(
    edges: list[Edge],
    src: FileNode,
    raw,
    logical_index: dict[str, list[FileNode]],
    max_cardinality: int,
) -> None:
    """Logical-ID resolver with specificity + cardinality caps.

    - skip purely-integer IDs (`123`): too noisy (Risk #3)
    - skip single-character IDs: likewise
    - skip IDs declared by > max_cardinality files: noisy and fan-out-heavy
    No edge is emitted for caps — NOT a unresolved edge. Diagnostics stay in
    logs; this keeps the graph clean per the user's "edges I can trust" rule.
    """
    lid = raw.raw
    if len(lid) < 2 or lid.isdigit():
        return
    decls = logical_index.get(lid, [])
    if not decls:
        edges.append(Edge(
            source=src.id, target=None, kind="logical-id",
            unresolved=lid,
        ))
        return
    if len(decls) > max_cardinality:
        return
    # Emit one edge per declarer. Sort deterministically by path.
    for tgt in sorted(decls, key=lambda f: f.path):
        if tgt.id == src.id:
            continue  # self-reference — skip
        edges.append(Edge(
            source=src.id, target=tgt.id, kind="logical-id", unresolved=None,
        ))


def _resolve_one(
    src: FileNode,
    raw: str,
    by_path: dict[str, FileNode],
    by_param_key: dict[str, list[FileNode]],
    src_local_keys: set[str],
):
    # 1. Path-based resolution
    if _looks_like_path(raw):
        candidates = _candidate_paths(src, raw)
        for c in candidates:
            if c in by_path:
                return by_path[c]
        # Path-ish but not found — return unresolved (not an id).
        return None

    # 2. Local id (O(1) set-lookup; replaces the prior linear `any(...)` probe).
    if raw in src_local_keys:
        # Declared locally; still emit edge back to self so the reference is
        # traceable in the graph.
        return src

    # 3. Global id
    matches = by_param_key.get(raw, [])
    if len(matches) == 1:
        return matches[0]
    if len(matches) > 1:
        return f"ambiguous:{raw} ({len(matches)} matches)"

    # 4. Unresolved
    return None


def _looks_like_path(raw: str) -> bool:
    return "/" in raw or "\\" in raw or raw.endswith(
        (".xml", ".yaml", ".yml", ".json", ".ini", ".cfg")
    )


def _candidate_paths(src: FileNode, raw: str) -> list[str]:
    """Compute ordered candidate POSIX paths for a path-style reference."""
    raw_posix = raw.replace("\\", "/")
    cands: list[str] = []

    # Absolute-ish (starts with /): strip leading slash, treat as root-relative.
    if raw_posix.startswith("/"):
        cands.append(_normalize(raw_posix.lstrip("/")))

    # Relative to source file's folder
    src_folder = src.folder
    if src_folder:
        cands.append(_normalize(f"{src_folder}/{raw_posix}"))
    else:
        cands.append(_normalize(raw_posix))

    # Plain (from root)
    cands.append(_normalize(raw_posix))

    # Dedupe preserving order
    seen: set[str] = set()
    out: list[str] = []
    for c in cands:
        if c not in seen:
            seen.add(c)
            out.append(c)
    return out


def _normalize(p: str) -> str:
    # posixpath.normpath collapses .. and .  (PurePosixPath does not).
    return posixpath.normpath(p)
