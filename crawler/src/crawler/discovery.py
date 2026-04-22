"""File discovery.

Walks a root directory, skipping dotfiles/dotdirs. Returns POSIX-normalized
relative paths paired with their absolute filesystem paths.
"""
from __future__ import annotations

import fnmatch
import logging
import sys
from collections.abc import Iterator
from pathlib import Path, PurePosixPath

SUPPORTED_EXTS = {".xml", ".xsd", ".yaml", ".yml", ".json", ".ini", ".cfg"}

# Heavy/uninteresting directory names that should be pruned at walk-time so we
# never `stat` their contents. Matched by name anywhere in the tree.
# Note: dot-dirs (`.git`, `.venv`) are already filtered by `_is_hidden`;
# `.venv` here is redundant-but-harmless. `venv` (no dot) is the important one.
DEFAULT_EXCLUDE_DIRS = frozenset({
    "node_modules",
    "dist",
    "build",
    "__pycache__",
    "target",
    ".venv",
    "venv",
    "vendor",
})

log = logging.getLogger("crawler")


def _is_hidden(name: str) -> bool:
    return name.startswith(".") and name not in {".", ".."}


def _matches_any(posix_rel: str, patterns: list[str]) -> bool:
    return any(fnmatch.fnmatch(posix_rel, p) for p in patterns)


def discover(
    root: Path,
    *,
    include: list[str] | None = None,
    exclude: list[str] | None = None,
    use_default_excludes: bool = True,
) -> Iterator[tuple[str, Path]]:
    """Yield (relative-POSIX-path, absolute Path) for each discovered file.

    - Skips dotfiles and dotdirectories (names starting with `.`).
    - When `use_default_excludes` is True (default), prunes directories named
      in `DEFAULT_EXCLUDE_DIRS` at walk-time (does not descend into them).
    - Skips unknown extensions (not in SUPPORTED_EXTS).
    - If `include` is provided, only files matching any include glob are yielded.
    - User-supplied `exclude` globs further remove matches (additive to defaults).
    - `tests/` paths ARE yielded by discovery (the viewer applies the hide-tests
      filter, not the crawler).
    """
    root = Path(root).resolve()
    if not root.is_dir():
        return

    pruned_dirs = DEFAULT_EXCLUDE_DIRS if use_default_excludes else frozenset()

    scanned = 0
    for abs_path in _iter_files(root, pruned_dirs):
        scanned += 1
        if scanned % 500 == 0:
            _heartbeat(f"scanned {scanned} files...")
        rel = abs_path.relative_to(root)
        parts = rel.parts
        if abs_path.suffix.lower() not in SUPPORTED_EXTS:
            continue
        posix_rel = str(PurePosixPath(*parts))
        if include and not _matches_any(posix_rel, include):
            continue
        if exclude and _matches_any(posix_rel, exclude):
            continue
        yield posix_rel, abs_path

    _heartbeat(f"discovery complete: scanned {scanned} files total")


def _iter_files(root: Path, pruned_dirs: frozenset[str]) -> Iterator[Path]:
    """Deterministic recursive iteration.

    - Skips hidden directories (`.git`, `.venv`, ...) early.
    - Skips directory names listed in `pruned_dirs` (e.g. `node_modules`,
      `__pycache__`) early — never `stat`s their contents.
    - Emits a heartbeat when entering each top-level directory under root so
      a slow filesystem (e.g. Windows bind-mount through Docker) shows progress.
    """
    # Prime the stack with sorted top-level entries so we can announce them.
    try:
        top_entries = sorted(root.iterdir(), key=lambda p: p.name)
    except PermissionError:
        return

    # Reverse so popping gives ascending order.
    stack: list[Path] = []
    for e in reversed(top_entries):
        if e.is_dir():
            if _is_hidden(e.name) or e.name in pruned_dirs:
                continue
            _heartbeat(f"entering {e.name}/")
            stack.append(e)
        elif e.is_file():
            yield e

    while stack:
        cur = stack.pop()
        try:
            entries = sorted(cur.iterdir(), key=lambda p: p.name)
        except PermissionError:
            continue
        for e in entries:
            if e.is_dir():
                if _is_hidden(e.name) or e.name in pruned_dirs:
                    continue
                stack.append(e)
            elif e.is_file():
                yield e


def _heartbeat(msg: str) -> None:
    """Low-volume progress signal.

    Prints to stderr unconditionally so the dockerized entrypoint shows
    something during slow walks (where logging level may be WARNING).
    Volume is intentionally low: one line per top-level dir + every 500 files.
    """
    print(f"crawler: {msg}", file=sys.stderr, flush=True)


def is_test_path(posix_rel: str) -> bool:
    """True when a relative POSIX path represents a test fixture for the
    hide-tests filter. Matches `tests/<...>` at the top level and any
    `<...>/tests/<...>` nested path."""
    parts = posix_rel.split("/")
    return "tests" in parts
