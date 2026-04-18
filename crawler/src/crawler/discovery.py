"""File discovery.

Walks a root directory, skipping dotfiles/dotdirs. Returns POSIX-normalized
relative paths paired with their absolute filesystem paths.
"""
from __future__ import annotations

import fnmatch
from pathlib import Path, PurePosixPath
from typing import Iterator, Optional

SUPPORTED_EXTS = {".xml", ".yaml", ".yml", ".json", ".ini", ".cfg"}


def _is_hidden(name: str) -> bool:
    return name.startswith(".") and name not in {".", ".."}


def _matches_any(posix_rel: str, patterns: list[str]) -> bool:
    return any(fnmatch.fnmatch(posix_rel, p) for p in patterns)


def discover(
    root: Path,
    *,
    include: Optional[list[str]] = None,
    exclude: Optional[list[str]] = None,
) -> Iterator[tuple[str, Path]]:
    """Yield (relative-POSIX-path, absolute Path) for each discovered file.

    - Skips dotfiles and dotdirectories (names starting with `.`).
    - Skips unknown extensions (not in SUPPORTED_EXTS).
    - If `include` is provided, only files matching any include glob are yielded.
    - `exclude` globs remove matches.
    - `tests/` paths ARE yielded by discovery (the viewer applies the hide-tests
      filter, not the crawler).
    """
    root = Path(root).resolve()
    if not root.is_dir():
        return

    for abs_path in sorted(_iter_files(root)):
        rel = abs_path.relative_to(root)
        # Skip hidden ancestors
        parts = rel.parts
        if any(_is_hidden(p) for p in parts):
            continue
        if abs_path.suffix.lower() not in SUPPORTED_EXTS:
            continue
        posix_rel = str(PurePosixPath(*parts))
        if include and not _matches_any(posix_rel, include):
            continue
        if exclude and _matches_any(posix_rel, exclude):
            continue
        yield posix_rel, abs_path


def _iter_files(root: Path) -> Iterator[Path]:
    """Deterministic recursive iteration, skipping hidden directories early."""
    stack = [root]
    while stack:
        cur = stack.pop()
        try:
            entries = sorted(cur.iterdir(), key=lambda p: p.name)
        except PermissionError:
            continue
        for e in entries:
            if e.is_dir():
                if _is_hidden(e.name):
                    continue
                stack.append(e)
            elif e.is_file():
                yield e


def is_test_path(posix_rel: str) -> bool:
    """True when a relative POSIX path represents a test fixture for the
    hide-tests filter. Matches `tests/<...>` at the top level and any
    `<...>/tests/<...>` nested path."""
    parts = posix_rel.split("/")
    return "tests" in parts
