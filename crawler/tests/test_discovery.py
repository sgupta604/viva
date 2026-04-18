from __future__ import annotations

from crawler.discovery import discover, is_test_path


def test_skips_hidden_directory(sample_module):
    paths = [p for p, _ in discover(sample_module)]
    assert not any(".hidden" in p for p in paths)


def test_skips_readme(sample_module):
    paths = [p for p, _ in discover(sample_module)]
    assert "README.md" not in paths


def test_paths_are_posix(sample_module):
    paths = [p for p, _ in discover(sample_module)]
    for p in paths:
        assert "\\" not in p, p


def test_tests_directory_is_included_by_discovery(sample_module):
    paths = [p for p, _ in discover(sample_module)]
    assert any(p.startswith("tests/") for p in paths)


def test_include_filter(sample_module):
    paths = [p for p, _ in discover(sample_module, include=["*.xml", "**/*.xml"])]
    for p in paths:
        assert p.endswith(".xml"), p


def test_exclude_filter(sample_module):
    paths = [p for p, _ in discover(sample_module, exclude=["tests/**"])]
    assert not any(p.startswith("tests/") for p in paths)


def test_is_test_path():
    assert is_test_path("tests/test_a.xml")
    assert is_test_path("module/tests/x.yaml")
    assert not is_test_path("config/radar.xml")
    assert not is_test_path("latest/stuff.xml")


def test_discovers_all_four_kinds(sample_module):
    paths = [p for p, _ in discover(sample_module)]
    exts = {p.rsplit(".", 1)[-1] for p in paths}
    assert "xml" in exts
    assert any(e in exts for e in ("yaml", "yml"))
    assert "json" in exts
    assert any(e in exts for e in ("ini", "cfg"))
