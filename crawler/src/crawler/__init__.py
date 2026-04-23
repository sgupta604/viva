"""viva-crawler: walks a config codebase and emits graph.json."""
from __future__ import annotations

from pathlib import Path

from .graph import Graph


def crawl(
    root: Path | str,
    *,
    include: list[str] | None = None,
    exclude: list[str] | None = None,
    no_timestamp: bool = False,
    use_default_excludes: bool = True,
    jobs: int = 1,
    logical_id_max_cardinality: int = 20,
) -> Graph:
    """Crawl `root` and return a Graph.

    See docs/GRAPH-SCHEMA.md for the output contract.

    ``jobs`` controls parse-time concurrency via ``ThreadPoolExecutor``. The
    default (1) is serial — identical behavior to the pre-jobs code path. Set
    >1 to parallelize; lxml releases the GIL during parse so threads help
    noticeably on large XML workloads. Output order is always deterministic
    (files sorted by path) regardless of jobs — we collect-then-sort.
    """
    from .clusters import build_clusters, build_d_aggregate_edges
    from .discovery import discover
    from .parsers import parse_file
    from .refs import resolve_references
    from .templating import mark_generated_from_manifests

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

    # v2: opt-in templating-manifest detection — flags matched files
    # generated=True. No-op when no manifest exists. Mutates files in-place.
    mark_generated_from_manifests(files, root_path)

    # v2: build ClusterNode[] from file paths + pair `.d/` dirs with sibling
    # files. Cluster build is pure; sidecar edges (d-aggregate) are merged with
    # the ref-resolved edges below.
    clusters = build_clusters(files)
    edges = resolve_references(
        files, logical_id_max_cardinality=logical_id_max_cardinality,
    )
    edges.extend(build_d_aggregate_edges(files, clusters))
    return Graph(
        root=root_path.name or str(root_path),
        files=files,
        edges=edges,
        clusters=clusters,
        generated_at=None if no_timestamp else _utc_now(),
    )


def _utc_now() -> str:
    # Python 3.9 compat — `datetime.UTC` is 3.11+. Keep `timezone.utc`.
    from datetime import datetime, timezone  # noqa: UP017
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")  # noqa: UP017


__all__ = ["crawl", "Graph"]
