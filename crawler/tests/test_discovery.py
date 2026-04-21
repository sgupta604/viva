from __future__ import annotations

from pathlib import Path

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


def _make_tree_with_node_modules(tmp_path: Path) -> Path:
    """Build a synthetic tree:
        root/
          keep.json
          node_modules/foo.json
          src/data.yaml
          src/skipme.yaml
    """
    (tmp_path / "keep.json").write_text("{}", encoding="utf-8")
    nm = tmp_path / "node_modules"
    nm.mkdir()
    (nm / "foo.json").write_text("{}", encoding="utf-8")
    src = tmp_path / "src"
    src.mkdir()
    (src / "data.yaml").write_text("a: 1\n", encoding="utf-8")
    (src / "skipme.yaml").write_text("a: 2\n", encoding="utf-8")
    return tmp_path


def test_default_excludes_prune_node_modules(tmp_path):
    root = _make_tree_with_node_modules(tmp_path)
    paths = [p for p, _ in discover(root)]
    assert "keep.json" in paths
    assert "src/data.yaml" in paths
    assert not any("node_modules" in p for p in paths), paths


def test_no_default_excludes_yields_node_modules(tmp_path):
    root = _make_tree_with_node_modules(tmp_path)
    paths = [p for p, _ in discover(root, use_default_excludes=False)]
    assert "node_modules/foo.json" in paths


def test_user_exclude_works_alongside_defaults(tmp_path):
    root = _make_tree_with_node_modules(tmp_path)
    paths = [p for p, _ in discover(root, exclude=["src/skipme.yaml"])]
    # Default excludes still active:
    assert not any("node_modules" in p for p in paths)
    # User exclude removed src/skipme.yaml:
    assert "src/skipme.yaml" not in paths
    # But other files remain:
    assert "src/data.yaml" in paths
    assert "keep.json" in paths
