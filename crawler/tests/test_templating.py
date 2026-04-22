"""Templating-manifest detection tests (C.5)."""
from __future__ import annotations

from pathlib import Path

from crawler import crawl


FIXTURES = Path(__file__).parent / "fixtures" / "sample-templating"


def test_manifest_marks_generated_file():
    graph = crawl(FIXTURES, no_timestamp=True)
    gen = next(f for f in graph.files if f.name == "generated-a.xml")
    hand = next(f for f in graph.files if f.name == "hand-authored.xml")
    assert gen.generated is True
    assert gen.generated_from == "templating_config.yaml"
    assert hand.generated is False
    assert hand.generated_from is None


def test_no_manifest_no_flags(tmp_path: Path):
    """Without a templating manifest, no file is flagged."""
    (tmp_path / "a.xml").write_text(
        '<?xml version="1.0"?><root/>', encoding="utf-8",
    )
    graph = crawl(tmp_path, no_timestamp=True)
    assert all(not f.generated for f in graph.files)
    assert all(f.generated_from is None for f in graph.files)


def test_manifest_absent_file_not_flagged(tmp_path: Path):
    """Manifest lists a file that doesn't exist → no-op, no error."""
    (tmp_path / "templating_config.yaml").write_text(
        "outputs:\n  - doesnotexist.xml\n", encoding="utf-8",
    )
    (tmp_path / "real.xml").write_text(
        '<?xml version="1.0"?><root/>', encoding="utf-8",
    )
    graph = crawl(tmp_path, no_timestamp=True)
    real = next(f for f in graph.files if f.name == "real.xml")
    assert real.generated is False
