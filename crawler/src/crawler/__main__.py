"""CLI wrapper around `crawl()`.

Usage:
    python -m crawler <root> [--out PATH] [--include GLOB]... [--exclude GLOB]...
                             [--no-timestamp] [--no-emit-sources] [--jobs N] [-v]

Source mirroring is ON by default (graph.json pairs with a sibling `source/`
directory). Pass `--no-emit-sources` to suppress it on very large codebases
where the mirrored tree is a disk-size concern.
"""
from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

from . import crawl
from .emit import mirror_sources, write

log = logging.getLogger("crawler")


def _build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="python -m crawler", description="viva config crawler")
    p.add_argument("root", help="Path to the codebase root to crawl")
    p.add_argument(
        "--out", default="./graph.json",
        help="Output graph.json path (default: ./graph.json)",
    )
    p.add_argument(
        "--include", action="append", default=None,
        help="Include glob (repeatable). Defaults to all supported extensions.",
    )
    p.add_argument(
        "--exclude", action="append", default=None,
        help="Exclude glob (repeatable). Additive to default directory excludes.",
    )
    p.add_argument(
        "--no-default-excludes", action="store_true",
        help=(
            "Do NOT prune common heavy directories (node_modules, dist, build, "
            "__pycache__, target, venv, .venv, vendor) at walk-time."
        ),
    )
    p.add_argument(
        "--no-timestamp", action="store_true",
        help="Omit generatedAt from output for deterministic diffs.",
    )
    p.add_argument(
        "--emit-sources", action=argparse.BooleanOptionalAction, default=True,
        help=(
            "Mirror source files into <out-dir>/source/ for the viewer Raw tab "
            "(default: on). Use --no-emit-sources to skip the mirror — recommended "
            "for very large codebases where the sidecar's disk footprint is a concern."
        ),
    )
    p.add_argument(
        "--jobs", type=int, default=1,
        help=(
            "Parallel parse workers via ThreadPoolExecutor (default: 1, serial). "
            "lxml releases the GIL during parse so threads help on big XML trees; "
            "enable after measuring your workload — the default stays serial so "
            "output ordering and error reporting are identical to prior versions."
        ),
    )
    p.add_argument("-v", "--verbose", action="count", default=0)
    return p


def main(argv: list[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)
    level = logging.WARNING - min(args.verbose, 2) * 10
    logging.basicConfig(level=level, format="%(levelname)s %(name)s: %(message)s")

    root = Path(args.root).resolve()
    if not root.is_dir():
        log.error("root is not a directory: %s", root)
        return 2

    if args.jobs < 1:
        log.error("--jobs must be >= 1, got %d", args.jobs)
        return 2

    out_path = Path(args.out)
    # Guard against the --emit-sources self-feedback loop: when the mirror
    # destination (<out>.parent/source) resolves inside the crawl root, the
    # next run would re-discover last run's sidecar files and nest them
    # recursively. Exclude the mirror dir from discovery to break the loop.
    # Generalized: any exclude glob the user already passed is preserved.
    exclude_globs = list(args.exclude) if args.exclude else []
    if args.emit_sources:
        mirror_dir = (out_path.resolve().parent / "source").resolve()
        try:
            rel = mirror_dir.relative_to(root)
        except ValueError:
            rel = None
        if rel is not None:
            rel_posix = rel.as_posix()
            exclude_globs.extend([f"{rel_posix}/**", rel_posix])
            log.info(
                "excluding emit-sources output subtree from walk: %s",
                rel_posix,
            )

    graph = crawl(
        root,
        include=args.include,
        exclude=exclude_globs or None,
        no_timestamp=args.no_timestamp,
        use_default_excludes=not args.no_default_excludes,
        jobs=args.jobs,
    )
    log.info(
        "crawled %s: %d files, %d edges (%d unresolved, %d parse errors)",
        root,
        len(graph.files),
        len(graph.edges),
        sum(1 for e in graph.edges if e.target is None),
        sum(1 for f in graph.files if f.parse_error),
    )

    write(graph, out_path)
    log.info("wrote %s", out_path)

    if args.emit_sources:
        mirror_sources(root, out_path, graph.files)
        log.info("mirrored sources to %s", out_path.parent / "source")
    else:
        log.info("--no-emit-sources: skipping source/ sidecar mirror")
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
