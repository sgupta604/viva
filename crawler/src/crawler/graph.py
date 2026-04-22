"""Graph data model for the crawler.

Shapes here mirror `docs/GRAPH-SCHEMA.md`. Any change must be treated as a
foundation-stream schema change — update the doc, the emitter, and the viewer
in lockstep.

v2 additions (large-codebase-viewer): ClusterNode top-level array, widened
EdgeKind (`xsd` / `d-aggregate` / `logical-id`), optional `attrs` on Edge,
optional `generated` + `generated_from` on FileNode.
"""
from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from pathlib import PurePosixPath
from typing import Literal, Optional

# Schema version this crawler emits. Bumped to 2 for large-codebase-viewer.
SCHEMA_VERSION = 2

FileKind = Literal["xml", "yaml", "json", "ini"]
ParamKind = Literal["scalar", "list", "map"]
# v2: widened union. `include|ref|import` from v1; `xsd|d-aggregate|logical-id` are v2.
EdgeKind = Literal[
    "include", "ref", "import", "xsd", "d-aggregate", "logical-id"
]
# v2: ClusterNode kind — "folder" for plain folder clusters, "d-aggregate" for
# `.d/` drop-in directory paired with a sibling file of the same stem.
ClusterKind = Literal["folder", "d-aggregate"]


@dataclass(frozen=True)
class ParamNode:
    key: str
    value: str
    kind: ParamKind
    line: Optional[int]

    def to_dict(self) -> dict:
        return {"key": self.key, "value": self.value, "kind": self.kind, "line": self.line}


@dataclass
class FileNode:
    id: str
    path: str  # POSIX, relative to root
    name: str
    folder: str
    kind: FileKind
    size_bytes: int
    params: list[ParamNode] = field(default_factory=list)
    parse_error: Optional[str] = None
    is_test: bool = False
    raw_refs: list["RawRef"] = field(default_factory=list)
    # v2 additions — opt-in templating-manifest flagging.
    generated: bool = False
    generated_from: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "path": self.path,
            "name": self.name,
            "folder": self.folder,
            "kind": self.kind,
            "sizeBytes": self.size_bytes,
            "params": [p.to_dict() for p in sorted(self.params, key=lambda p: p.key)],
            "parseError": self.parse_error,
            "isTest": self.is_test,
            "generated": self.generated,
            "generatedFrom": self.generated_from,
        }


@dataclass(frozen=True)
class RawRef:
    """A reference as emitted by a parser, pre-resolution.

    For v2 parsers can attach an optional `flags` dict to carry classification
    hints from the parser (e.g. `has_fallback=True` for xi:include siblings).
    The resolver inspects flags to stamp `unresolved` prefixes like `fallback:`.
    """

    kind: EdgeKind
    raw: str  # the raw target string (a path, an id, etc.)
    # v2: optional flags — None for legacy callers that don't carry hints.
    flags: Optional[tuple] = None  # tuple of (key, value) pairs, frozenset-safe


@dataclass
class Edge:
    source: str  # file id
    target: Optional[str]  # file id, None if unresolved
    kind: EdgeKind
    unresolved: Optional[str]  # raw target when target is None (may carry a prefix)
    # v2 addition — free-form edge metadata. Only `order: int` is currently used
    # (for `.d/` load order). Emitted only when non-empty.
    attrs: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        out: dict = {
            "source": self.source,
            "target": self.target,
            "kind": self.kind,
            "unresolved": self.unresolved,
        }
        if self.attrs:
            out["attrs"] = self.attrs
        return out

    @property
    def sort_key(self) -> tuple:
        # Nulls last: use a sentinel char that sorts high.
        target = self.target if self.target is not None else "￿"
        unresolved = self.unresolved if self.unresolved is not None else "￿"
        return (self.source, self.kind, target, unresolved)


@dataclass
class ClusterNode:
    """v2 top-level cluster entry. One per folder in the crawled tree.

    The crawler builds these in `clusters.py` after discovery. Viewer consumes
    them as-is — no viewer-side derivation needed for v2 inputs.
    """

    path: str  # POSIX path relative to root
    parent: Optional[str]  # parent cluster path, or None for top-level clusters
    child_files: list[str] = field(default_factory=list)  # file ids directly in this cluster
    child_clusters: list[str] = field(default_factory=list)  # child cluster paths
    kind: ClusterKind = "folder"

    def to_dict(self) -> dict:
        return {
            "path": self.path,
            "parent": self.parent,
            "childFiles": list(self.child_files),
            "childClusters": list(self.child_clusters),
            "kind": self.kind,
        }


@dataclass
class Graph:
    root: str
    files: list[FileNode]
    edges: list[Edge]
    # v2: `version` defaults to SCHEMA_VERSION (2). Existing callers that pass
    # `version=1` explicitly still work (the viewer tolerates both on read).
    version: int = SCHEMA_VERSION
    clusters: list[ClusterNode] = field(default_factory=list)
    generated_at: Optional[str] = None

    def to_dict(self) -> dict:
        out: dict = {
            "version": self.version,
            "root": self.root,
        }
        if self.generated_at is not None:
            out["generatedAt"] = self.generated_at
        out["files"] = [f.to_dict() for f in sorted(self.files, key=lambda f: f.path)]
        out["edges"] = [e.to_dict() for e in sorted(self.edges, key=lambda e: e.sort_key)]
        # v2: clusters always present in output, empty array when no files.
        out["clusters"] = [
            c.to_dict() for c in sorted(self.clusters, key=lambda c: c.path)
        ]
        return out


def stable_id(posix_path: str) -> str:
    """First 10 hex chars of SHA-1(POSIX path). Contract rule in GRAPH-SCHEMA.md."""
    return hashlib.sha1(posix_path.encode("utf-8")).hexdigest()[:10]


def as_posix(path: str) -> str:
    """Normalize a path to POSIX (forward slashes). Accepts Windows paths too."""
    return str(PurePosixPath(path.replace("\\", "/")))
