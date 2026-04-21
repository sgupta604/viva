"""CLI wrapper around `crawl()`.

Usage:
    python -m crawler <root> [--out PATH] [--include GLOB]... [--exclude GLOB]...
                             [--no-timestamp] [--emit-sources] [-v]
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
        "--emit-sources", action="store_true",
        help="Mirror source files into <out-dir>/source/ for the viewer Raw tab.",
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

    graph = crawl(
        root,
        include=args.include,
        exclude=args.exclude,
        no_timestamp=args.no_timestamp,
        use_default_excludes=not args.no_default_excludes,
    )
    log.info(
        "crawled %s: %d files, %d edges (%d unresolved, %d parse errors)",
        root,
        len(graph.files),
        len(graph.edges),
        sum(1 for e in graph.edges if e.target is None),
        sum(1 for f in graph.files if f.parse_error),
    )

    out_path = Path(args.out)
    write(graph, out_path)
    log.info("wrote %s", out_path)

    if args.emit_sources:
        mirror_sources(root, out_path, graph.files)
        log.info("mirrored sources to %s", out_path.parent / "source")
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
