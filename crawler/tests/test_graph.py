from __future__ import annotations

from crawler.graph import (
    ClusterNode,
    Edge,
    FileNode,
    Graph,
    ParamNode,
    as_posix,
    stable_id,
)


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


# --- v2 schema ---------------------------------------------------------------


def test_graph_v2_default_version_is_two():
    """F.2: Crawler now emits version=2 by default."""
    g = Graph(root="r", files=[], edges=[], clusters=[])
    assert g.to_dict()["version"] == 2


def test_graph_v2_emits_clusters_array():
    """F.2: clusters[] is always present in output (empty when no files)."""
    g = Graph(root="r", files=[], edges=[], clusters=[])
    d = g.to_dict()
    assert "clusters" in d
    assert d["clusters"] == []


def test_cluster_node_to_dict_camelcases_child_fields():
    """F.2: ClusterNode serializes to camelCase (childFiles, childClusters)."""
    c = ClusterNode(
        path="a/b",
        parent="a",
        child_files=["id1", "id2"],
        child_clusters=["a/b/c"],
        kind="folder",
    )
    d = c.to_dict()
    assert d == {
        "path": "a/b",
        "parent": "a",
        "childFiles": ["id1", "id2"],
        "childClusters": ["a/b/c"],
        "kind": "folder",
    }


def test_cluster_node_d_aggregate_kind():
    c = ClusterNode(path="x.d", parent=None, child_files=[], child_clusters=[], kind="d-aggregate")
    assert c.to_dict()["kind"] == "d-aggregate"


def test_graph_emits_sorted_clusters():
    c_b = ClusterNode(path="b", parent=None, child_files=[], child_clusters=[], kind="folder")
    c_a = ClusterNode(path="a", parent=None, child_files=[], child_clusters=[], kind="folder")
    g = Graph(root="r", files=[], edges=[], clusters=[c_b, c_a])
    assert [c["path"] for c in g.to_dict()["clusters"]] == ["a", "b"]


def test_file_node_v2_generated_defaults_false():
    f = FileNode(id="a", path="a.xml", name="a.xml", folder="", kind="xml", size_bytes=0)
    d = f.to_dict()
    assert d["generated"] is False
    assert d["generatedFrom"] is None


def test_file_node_v2_generated_carries_manifest():
    f = FileNode(
        id="a",
        path="a.xml",
        name="a.xml",
        folder="",
        kind="xml",
        size_bytes=0,
        generated=True,
        generated_from="scripts/templating_config.yaml",
    )
    d = f.to_dict()
    assert d["generated"] is True
    assert d["generatedFrom"] == "scripts/templating_config.yaml"


def test_edge_v2_widened_kinds_accepted():
    """F.2: EdgeKind literal is widened; these constructions must not raise."""
    e_xsd = Edge("a", "b", "xsd", None)
    e_d = Edge("a", "b", "d-aggregate", None, attrs={"order": 1})
    e_logical = Edge("a", "b", "logical-id", None)
    assert e_xsd.to_dict()["kind"] == "xsd"
    assert e_logical.to_dict()["kind"] == "logical-id"
    d_dict = e_d.to_dict()
    assert d_dict["kind"] == "d-aggregate"
    assert d_dict["attrs"] == {"order": 1}


def test_edge_attrs_omitted_when_empty():
    """Edges without attrs emit no 'attrs' key."""
    e = Edge("a", "b", "include", None)
    assert "attrs" not in e.to_dict()


def test_edge_unresolved_classification_prefix_round_trips():
    """`unresolved` may carry classification prefixes (fallback:, ambiguous:)."""
    e_fb = Edge("a", None, "include", "fallback:missing.xml")
    e_amb = Edge("a", None, "xsd", "ambiguous:schema.xsd")
    assert e_fb.to_dict()["unresolved"] == "fallback:missing.xml"
    assert e_amb.to_dict()["unresolved"] == "ambiguous:schema.xsd"
