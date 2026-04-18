from __future__ import annotations

from crawler.graph import Edge, FileNode, Graph, ParamNode, as_posix, stable_id


def test_stable_id_deterministic():
    assert stable_id("config/radar.xml") == stable_id("config/radar.xml")
    assert len(stable_id("x")) == 10


def test_as_posix_normalizes_backslashes():
    assert as_posix("config\\radar.xml") == "config/radar.xml"
    assert as_posix("a/b/c.xml") == "a/b/c.xml"


def test_graph_to_dict_deterministic_ordering():
    f1 = FileNode(
        id="aa",
        path="b.xml",
        name="b.xml",
        folder="",
        kind="xml",
        size_bytes=1,
        params=[ParamNode("z", "1", "scalar", 1), ParamNode("a", "2", "scalar", 2)],
    )
    f2 = FileNode(
        id="bb",
        path="a.xml",
        name="a.xml",
        folder="",
        kind="xml",
        size_bytes=1,
    )
    g = Graph(
        version=1,
        root="r",
        files=[f1, f2],
        edges=[
            Edge("aa", "bb", "include", None),
            Edge("aa", None, "ref", "ghost"),
        ],
    )
    d = g.to_dict()
    # Files sorted by path
    assert [f["path"] for f in d["files"]] == ["a.xml", "b.xml"]
    # Params sorted by key
    b_params = [f["params"] for f in d["files"] if f["path"] == "b.xml"][0]
    assert [p["key"] for p in b_params] == ["a", "z"]
    # Edges: unresolved (None target) sorts last within same (source,kind)
    assert d["edges"][0] == {"source": "aa", "target": "bb", "kind": "include", "unresolved": None}


def test_graph_omits_generated_at_when_none():
    g = Graph(version=1, root="r", files=[], edges=[], generated_at=None)
    assert "generatedAt" not in g.to_dict()


def test_graph_includes_generated_at_when_set():
    g = Graph(version=1, root="r", files=[], edges=[], generated_at="2026-04-18T00:00:00Z")
    assert g.to_dict()["generatedAt"] == "2026-04-18T00:00:00Z"
