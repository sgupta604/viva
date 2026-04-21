from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from pathlib import Path

import pytest

from crawler import crawl
from crawler.emit import to_json, write


@pytest.mark.integration
def test_full_crawl_deterministic(sample_module: Path, tmp_path: Path):
    """Two consecutive crawls with --no-timestamp produce byte-identical bytes."""
    g1 = crawl(sample_module, no_timestamp=True)
    g2 = crawl(sample_module, no_timestamp=True)
    s1 = to_json(g1).encode("utf-8")
    s2 = to_json(g2).encode("utf-8")
    assert hashlib.sha256(s1).hexdigest() == hashlib.sha256(s2).hexdigest(), (
        "two consecutive crawls must produce byte-identical graph.json"
    )


@pytest.mark.integration
def test_expected_counts(sample_module: Path):
    """Lock the headline counts so regressions in parsing/resolution surface loudly."""
    g = crawl(sample_module, no_timestamp=True)
    # 20 source files minus README.md and .hidden/ignored.xml = 18 parseable files
    # (config/xi-include.xml and config/entity-decl.xml were added for the
    # xml-viewer-hardening recover-mode coverage.)
    names = sorted(f.path for f in g.files)
    assert "config/broken.xml" in names
    assert "config/encoding-latin1.xml" in names
    assert "config/ingestion.xml" in names
    assert "config/radar.xml" in names
    assert "config/xi-include.xml" in names
    assert "config/entity-decl.xml" in names
    assert "shared/common.xml" in names
    assert "shared/defaults.json" in names
    assert "pipelines/main.yaml" in names
    assert "pipelines/secondary.yml" in names
    assert "pipelines/anchors.yaml" in names
    assert "thresholds/rain.ini" in names
    assert "thresholds/wind.cfg" in names
    assert "environments/dev.json" in names
    assert "environments/prod.json" in names
    assert "dangling/ghost-ref.xml" in names
    assert "tests/test_radar.xml" in names
    assert "tests/test_helpers.yaml" in names
    assert ".hidden/ignored.xml" not in names
    assert "README.md" not in names
    assert len(g.files) == 18

    parse_errors = [f for f in g.files if f.parse_error]
    assert len(parse_errors) == 1 and parse_errors[0].path == "config/broken.xml"

    # xi-include.xml parses clean under recover mode even with the namespace
    # declaration omitted — the regression this feature exists to fix.
    xi = next(f for f in g.files if f.path == "config/xi-include.xml")
    assert xi.parse_error is None
    assert any(r.raw == "shared/common.xml" for r in xi.raw_refs)

    # entity-decl.xml surfaces its ENTITY SYSTEM target as a kind=include raw ref.
    entity = next(f for f in g.files if f.path == "config/entity-decl.xml")
    assert any(r.kind == "include" and r.raw == "shared/common.xml" for r in entity.raw_refs)

    unresolved = [e for e in g.edges if e.target is None]
    # ghost-ref.xml has 2 raw refs (one include path, one ref id) both unresolved.
    # environments/dev.json has $include to ../config/ingestion.xml (resolved).
    assert len(unresolved) >= 2


@pytest.mark.integration
def test_matches_committed_expected(sample_module: Path):
    """Round-trip against the committed expected graph. If this drifts, either
    fix the regression or update the fixture AND viewer/e2e/fixtures/graph.json
    in lockstep."""
    expected_path = Path(__file__).parent / "fixtures" / "sample-module.expected.graph.json"
    if not expected_path.exists():
        pytest.skip("expected.graph.json not yet committed")
    g = crawl(sample_module, no_timestamp=True)
    actual = json.loads(to_json(g))
    expected = json.loads(expected_path.read_text(encoding="utf-8"))
    # Drop generatedAt from both sides before comparing.
    actual.pop("generatedAt", None)
    expected.pop("generatedAt", None)
    assert actual == expected


@pytest.mark.integration
def test_cli_smoke(sample_module: Path, tmp_path: Path):
    out = tmp_path / "graph.json"
    result = subprocess.run(
        [sys.executable, "-m", "crawler", str(sample_module), "--out", str(out), "--no-timestamp"],
        capture_output=True, text=True,
    )
    assert result.returncode == 0, result.stderr
    assert out.exists()
    data = json.loads(out.read_text(encoding="utf-8"))
    assert data["version"] == 1
    assert len(data["files"]) > 0


@pytest.mark.integration
def test_paths_are_posix_on_windows(sample_module: Path):
    g = crawl(sample_module, no_timestamp=True)
    for f in g.files:
        assert "\\" not in f.path, f"Windows-style path leaked into graph.json: {f.path}"
        assert "\\" not in f.folder


@pytest.mark.integration
def test_parallel_parse_determinism(sample_module: Path):
    """jobs=1 and jobs=4 must produce identical graph output (TR8).

    Parallel execution uses ThreadPoolExecutor; completion order is
    non-deterministic, so the pipeline collects-then-sorts by path before
    returning. This test locks that invariant so a future change to the
    parallel path can't silently reorder files or edges.
    """
    g_serial = crawl(sample_module, no_timestamp=True, jobs=1)
    g_parallel = crawl(sample_module, no_timestamp=True, jobs=4)
    assert to_json(g_serial) == to_json(g_parallel), (
        "serial and parallel crawls must produce byte-identical graph.json"
    )
