"""Graph data model for the crawler.

Shapes here mirror `docs/GRAPH-SCHEMA.md`. Any change must be treated as a
foundation-stream schema change — update the doc, the emitter, and the viewer
in lockstep.
"""
from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from pathlib import PurePosixPath
from typing import Literal, Optional

FileKind = Literal["xml", "yaml", "json", "ini"]
ParamKind = Literal["scalar", "list", "map"]
EdgeKind = Literal["include", "ref", "import"]


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
        }


@dataclass(frozen=True)
class RawRef:
    """A reference as emitted by a parser, pre-resolution."""

    kind: EdgeKind
    raw: str  # the raw target string (a path, an id, etc.)


@dataclass
class Edge:
    source: str  # file id
    target: Optional[str]  # file id, None if unresolved
    kind: EdgeKind
    unresolved: Optional[str]  # raw target when target is None

    def to_dict(self) -> dict:
        return {
            "source": self.source,
            "target": self.target,
            "kind": self.kind,
            "unresolved": self.unresolved,
        }

    @property
    def sort_key(self) -> tuple:
        # Nulls last: use a sentinel char that sorts high.
        target = self.target if self.target is not None else "\uffff"
        unresolved = self.unresolved if self.unresolved is not None else "\uffff"
        return (self.source, self.kind, target, unresolved)


@dataclass
class Graph:
    version: int
    root: str
    files: list[FileNode]
    edges: list[Edge]
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
        return out


def stable_id(posix_path: str) -> str:
    """First 10 hex chars of SHA-1(POSIX path). Contract rule in GRAPH-SCHEMA.md."""
    return hashlib.sha1(posix_path.encode("utf-8")).hexdigest()[:10]


def as_posix(path: str) -> str:
    """Normalize a path to POSIX (forward slashes). Accepts Windows paths too."""
    return str(PurePosixPath(path.replace("\\", "/")))
