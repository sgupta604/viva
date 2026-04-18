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
"""
from __future__ import annotations

import posixpath

from .graph import Edge, FileNode


def resolve_references(files: list[FileNode]) -> list[Edge]:
    by_path: dict[str, FileNode] = {f.path: f for f in files}
    by_param_key: dict[str, list[FileNode]] = {}
    for f in files:
        for p in f.params:
            by_param_key.setdefault(p.key, []).append(f)

    edges: list[Edge] = []
    for src in files:
        for raw in src.raw_refs:
            resolved = _resolve_one(src, raw.raw, by_path, by_param_key)
            if resolved is None:
                edges.append(Edge(source=src.id, target=None, kind=raw.kind, unresolved=raw.raw))
            elif isinstance(resolved, str) and resolved.startswith("ambiguous:"):
                edges.append(Edge(source=src.id, target=None, kind=raw.kind, unresolved=resolved))
            elif isinstance(resolved, FileNode):
                edges.append(Edge(source=src.id, target=resolved.id, kind=raw.kind, unresolved=None))
    return edges


def _resolve_one(
    src: FileNode,
    raw: str,
    by_path: dict[str, FileNode],
    by_param_key: dict[str, list[FileNode]],
):
    # 1. Path-based resolution
    if _looks_like_path(raw):
        candidates = _candidate_paths(src, raw)
        for c in candidates:
            if c in by_path:
                return by_path[c]
        # Path-ish but not found — return unresolved (not an id).
        return None

    # 2. Local id
    if any(p.key == raw for p in src.params):
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
