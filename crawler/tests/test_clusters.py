"""Unit tests for clusters.build_clusters (C.2).

Pure-function tests over synthesized FileNode lists. Integration test that
drives clusters through crawl() lives in test_refs_d_aggregate.py.
"""
from __future__ import annotations

from crawler.clusters import build_clusters
from crawler.graph import FileNode


def _f(path: str) -> FileNode:
    folder = path.rsplit("/", 1)[0] if "/" in path else ""
    return FileNode(
        id=path,
        path=path,
        name=path.rsplit("/", 1)[-1],
        folder=folder,
        kind="xml",
        size_bytes=0,
    )


def test_folder_tree_build():
    """Three folders × 5 files → 3 ClusterNode with correct parent chain."""
    files = [
        _f("a/b/one.xml"),
        _f("a/b/two.xml"),
        _f("a/c/three.xml"),
        _f("other/four.xml"),
        _f("other/five.xml"),
    ]
    clusters = build_clusters(files)
    paths = {c.path for c in clusters}
    assert paths == {"a", "a/b", "a/c", "other"}
    a = next(c for c in clusters if c.path == "a")
    ab = next(c for c in clusters if c.path == "a/b")
    ac = next(c for c in clusters if c.path == "a/c")
    other = next(c for c in clusters if c.path == "other")
    assert a.parent is None
    assert ab.parent == "a"
    assert ac.parent == "a"
    assert other.parent is None
    assert ab.child_files == ["a/b/one.xml", "a/b/two.xml"]
    assert ac.child_files == ["a/c/three.xml"]
    assert other.child_files == ["other/five.xml", "other/four.xml"]
    assert sorted(a.child_clusters) == ["a/b", "a/c"]


def test_d_dir_pairing():
    """foo.d/ with sibling foo.xml → cluster kind='d-aggregate'."""
    files = [
        _f("top/foo.xml"),
        _f("top/foo.d/01-piece.xml"),
        _f("top/foo.d/02-piece.xml"),
    ]
    clusters = build_clusters(files)
    d_cluster = next(c for c in clusters if c.path == "top/foo.d")
    assert d_cluster.kind == "d-aggregate"


def test_d_dir_false_positive_guard():
    """bar.d/ WITHOUT sibling bar.xml stays kind='folder'."""
    files = [
        _f("top/bar.d/orphan.xml"),
        # Note: no top/bar.xml
    ]
    clusters = build_clusters(files)
    d_cluster = next(c for c in clusters if c.path == "top/bar.d")
    assert d_cluster.kind == "folder"


def test_d_dir_matches_any_sibling_extension():
    """foo.d paired with foo.json (not foo.xml) still counts as d-aggregate."""
    files = [
        _f("top/foo.json"),
        _f("top/foo.d/01-piece.xml"),
    ]
    clusters = build_clusters(files)
    d_cluster = next(c for c in clusters if c.path == "top/foo.d")
    assert d_cluster.kind == "d-aggregate"


def test_empty_file_list():
    assert build_clusters([]) == []


def test_cluster_sort_is_deterministic():
    files = [
        _f("z/one.xml"),
        _f("a/one.xml"),
        _f("m/one.xml"),
    ]
    paths = [c.path for c in build_clusters(files)]
    assert paths == sorted(paths)
