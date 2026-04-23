"""Dogfood: crawl the viva repo itself and assert structural invariants.

Runs with the ``integration`` marker so the default ``pytest`` invocation
stays fast; ``/test`` invokes ``pytest -m integration`` to include it.

The assertions deliberately target structural invariants (an upper bound on
parse errors plus the successful xi-include fixture) rather than exact file
counts — the repo grows and shrinks as features land, and this test should
only fire when a real crawler regression lands.
"""
from __future__ import annotations

from pathlib import Path

import pytest

from crawler import crawl

# Repo root = three levels up from this file:
# crawler/tests/test_dogfood.py -> crawler/tests -> crawler -> repo-root.
REPO_ROOT = Path(__file__).resolve().parent.parent.parent


# Intentional bad-fixture files that we expect to produce parse errors. The
# dogfood test fails loudly if ANY file outside this set lights up with a
# parse_error after the recover-mode switch.
#
# The sample-module is mirrored into viewer/e2e/fixtures/source/ and
# viewer/public/source/ by --emit-sources, so its broken.xml shows up under
# three distinct paths. Match by filename + any "broken.xml" under a known
# fixture or mirrored-source tree.
_KNOWN_BROKEN_MARKERS: tuple[str, ...] = (
    "sample-module/config/broken.xml",
    "fixtures/source/config/broken.xml",
    "public/source/config/broken.xml",
)


def _is_known_broken(path: str) -> bool:
    posix = path.replace("\\", "/")
    return any(marker in posix for marker in _KNOWN_BROKEN_MARKERS)


@pytest.mark.integration
def test_dogfood_crawl_viva_root():
    """Crawling viva itself should only surface intentional broken fixtures."""
    graph = crawl(REPO_ROOT, no_timestamp=True)

    parse_errors = [f for f in graph.files if f.parse_error]
    unexpected = [f for f in parse_errors if not _is_known_broken(f.path)]
    assert not unexpected, (
        "dogfood: unexpected parse errors in viva repo: "
        + ", ".join(f"{f.path} -> {f.parse_error}" for f in unexpected)
    )


@pytest.mark.integration
def test_dogfood_xi_include_parses_clean():
    """The xi-include fixture must parse clean under recover mode.

    This is the fix that motivates the feature — if this regresses, the
    xi:include dogfood failure is back.
    """
    graph = crawl(REPO_ROOT, no_timestamp=True)
    xi_files = [
        f for f in graph.files
        if f.name == "xi-include.xml" and "sample-module" in f.path
    ]
    assert xi_files, "xi-include.xml fixture should be discovered somewhere in the repo"
    for f in xi_files:
        assert f.parse_error is None, (
            f"xi-include should parse clean under recover mode: "
            f"{f.path} -> {f.parse_error}"
        )
        assert any(r.raw == "shared/common.xml" for r in f.raw_refs), (
            f"xi-include must capture href='shared/common.xml' as a raw ref: "
            f"{f.path} -> {[r.raw for r in f.raw_refs]}"
        )


@pytest.mark.integration
def test_dogfood_recrawl_byte_identical():
    """Re-crawl invariant (C.6 / Risk #11).

    Crawling the viva repo twice must produce byte-identical graph JSON.
    The xml-viewer-hardening post-finalize lesson: the emit-sources sidecar
    was producing different output on re-run because it wasn't excluded from
    walk. The fix (dd2f273) prevented the feedback loop; THIS test makes it
    regression-proof.
    """
    import json

    from crawler.emit import to_json

    g1 = to_json(crawl(REPO_ROOT, no_timestamp=True))
    g2 = to_json(crawl(REPO_ROOT, no_timestamp=True))
    # Compare structurally rather than raw bytes — timestamps aside, emit is
    # deterministic by design. json.loads to give a helpful diff on mismatch.
    assert json.loads(g1) == json.loads(g2), (
        "dogfood: re-crawl produced a different graph — feedback loop?"
    )


@pytest.mark.integration
def test_dogfood_graph_is_bounded():
    """Sanity ceiling: the crawler shouldn't be pulling in anything absurd.

    Structural invariant — grows with the repo but never balloons past a sane
    upper bound for a config-visualizer project.
    """
    graph = crawl(REPO_ROOT, no_timestamp=True)
    # Absurd ceiling: 5k config files would mean node_modules leaked in.
    assert 0 < len(graph.files) < 5000, (
        f"dogfood: file count looks wrong: {len(graph.files)}"
    )
    # Every file must have a POSIX path (TR6 / TR9).
    for f in graph.files:
        assert "\\" not in f.path, f"Windows path leaked: {f.path}"
