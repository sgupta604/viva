"""Deterministic JSON emitter for Graph.

Output rules (see docs/GRAPH-SCHEMA.md):
  - files[] sorted by path; params[] sorted by key; edges[] sorted by
    (source, kind, target-or-sentinel, unresolved-or-sentinel).
  - json.dumps with sort_keys=True, indent=2, ensure_ascii=False, trailing newline (\n).
  - `--no-timestamp` omits `generatedAt`.
  - Optional `emit_sources` mirrors each FileNode's raw bytes under
    `<out_dir>/source/<path>` so the viewer's Raw tab can fetch them.
"""
from __future__ import annotations

import json
import shutil
from pathlib import Path

from .graph import Graph


def to_json(graph: Graph) -> str:
    """Serialize the Graph to a deterministic JSON string."""
    return json.dumps(graph.to_dict(), sort_keys=True, indent=2, ensure_ascii=False) + "\n"


def write(graph: Graph, out_path: Path) -> None:
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    # Force LF line endings so Windows/Unix crawls produce byte-identical output.
    with open(out_path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(to_json(graph))


def mirror_sources(root: Path, out_path: Path, files: list) -> None:
    """Copy each file's absolute source into `<out_dir>/source/<rel-path>`."""
    out_dir = Path(out_path).parent / "source"
    if out_dir.exists():
        shutil.rmtree(out_dir)
    for f in files:
        abs_src = Path(root) / f.path
        dst = out_dir / f.path
        dst.parent.mkdir(parents=True, exist_ok=True)
        try:
            shutil.copyfile(abs_src, dst)
        except FileNotFoundError:
            # A parser saw the file but it vanished between parse and mirror —
            # skip instead of aborting the whole emit.
            continue
