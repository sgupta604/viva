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
    jobs: int = 1,
) -> Graph:
    """Crawl `root` and return a Graph.

    See docs/GRAPH-SCHEMA.md for the output contract.

    ``jobs`` controls parse-time concurrency via ``ThreadPoolExecutor``. The
    default (1) is serial — identical behavior to the pre-jobs code path. Set
    >1 to parallelize; lxml releases the GIL during parse so threads help
    noticeably on large XML workloads. Output order is always deterministic
    (files sorted by path) regardless of jobs — we collect-then-sort.
    """
    from .discovery import discover
    from .parsers import parse_file
    from .refs import resolve_references

    root_path = Path(root).resolve()
    discovered = list(
        discover(
            root_path,
            include=include,
            exclude=exclude,
            use_default_excludes=use_default_excludes,
        )
    )

    files = []
    if jobs <= 1:
        for rel_path, abs_path in discovered:
            node = parse_file(rel_path, abs_path)
            if node is not None:
                files.append(node)
    else:
        from concurrent.futures import ThreadPoolExecutor
        with ThreadPoolExecutor(max_workers=jobs) as pool:
            # Submit in discovery order; collect and then sort by path so the
            # output is deterministic regardless of completion order (TR8).
            results = list(pool.map(lambda rp: parse_file(rp[0], rp[1]), discovered))
        for node in results:
            if node is not None:
                files.append(node)

    # Deterministic file ordering: sort by path. Matches Graph.to_dict() but
    # doing it here means `files` in the returned Graph is already stable,
    # which the parallel-determinism test relies on.
    files.sort(key=lambda f: f.path)

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
