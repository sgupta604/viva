"""viva-crawler: walks a config codebase and emits graph.json."""
from __future__ import annotations

from pathlib import Path
from typing import Optional

from .graph import Graph


def crawl(
    root: Path | str,
    *,
    include: Optional[list[str]] = None,
    exclude: Optional[list[str]] = None,
    no_timestamp: bool = False,
    use_default_excludes: bool = True,
) -> Graph:
    """Crawl `root` and return a Graph.

    See docs/GRAPH-SCHEMA.md for the output contract.
    """
    # Implementation wired up in Stream C; see __main__.py and emit.py for
    # the full pipeline (discovery -> parsers -> refs -> emit).
    from .discovery import discover
    from .parsers import parse_file
    from .refs import resolve_references

    root_path = Path(root).resolve()
    files = []
    for rel_path, abs_path in discover(
        root_path,
        include=include,
        exclude=exclude,
        use_default_excludes=use_default_excludes,
    ):
        node = parse_file(rel_path, abs_path)
        if node is not None:
            files.append(node)

    edges = resolve_references(files)
    return Graph(
        version=1,
        root=root_path.name or str(root_path),
        files=files,
        edges=edges,
        generated_at=None if no_timestamp else _utc_now(),
    )


def _utc_now() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


__all__ = ["crawl", "Graph"]
