from __future__ import annotations

import hashlib
from pathlib import Path

from crawler.emit import to_json, write
from crawler.graph import ClusterNode, Edge, FileNode, Graph, ParamNode


def _tiny_graph(generated_at=None):
    return Graph(
        version=1,
        root="sample",
        files=[
            FileNode(
                id="aaa",
                path="a.xml",
                name="a.xml",
                folder="",
                kind="xml",
                size_bytes=10,
                params=[ParamNode("x.y", "1", "scalar", 1)],
            ),
        ],
        edges=[Edge("aaa", None, "ref", "ghost")],
        generated_at=generated_at,
    )


def test_to_json_deterministic_same_bytes():
    g = _tiny_graph()
    a = to_json(g).encode("utf-8")
    b = to_json(g).encode("utf-8")
    assert hashlib.sha256(a).hexdigest() == hashlib.sha256(b).hexdigest()


def test_to_json_excludes_generated_at_when_none():
    g = _tiny_graph()
    s = to_json(g)
    assert "generatedAt" not in s


def test_to_json_includes_generated_at_when_set():
    g = _tiny_graph(generated_at="2026-04-18T00:00:00Z")
    s = to_json(g)
    assert "\"generatedAt\": \"2026-04-18T00:00:00Z\"" in s


def test_write_uses_lf_line_endings(tmp_path: Path):
    g = _tiny_graph()
    out = tmp_path / "g.json"
    write(g, out)
    raw = out.read_bytes()
    assert b"\r\n" not in raw
    assert raw.endswith(b"\n")


def test_emits_sorted_files_and_params():
    f1 = FileNode(
        id="b", path="b.xml", name="b.xml", folder="", kind="xml", size_bytes=0,
        params=[ParamNode("z", "1", "scalar", 1), ParamNode("a", "2", "scalar", 1)],
    )
    f2 = FileNode(id="a", path="a.xml", name="a.xml", folder="", kind="xml", size_bytes=0)
    g = Graph(version=1, root="r", files=[f1, f2], edges=[])
    import json as _json
    payload = _json.loads(to_json(g))
    assert [f["path"] for f in payload["files"]] == ["a.xml", "b.xml"]
    b_params = [f["params"] for f in payload["files"] if f["path"] == "b.xml"][0]
    assert [p["key"] for p in b_params] == ["a", "z"]


# --- v2 emission -------------------------------------------------------------


def test_emit_v2_round_trips_clusters_and_generated_flags():
    """F.2: v2 emission round-trips through json.loads with camelCase boundary."""
    import json as _json

    f = FileNode(
        id="a",
        path="tpl/out.xml",
        name="out.xml",
        folder="tpl",
        kind="xml",
        size_bytes=0,
        generated=True,
        generated_from="tpl/manifest.yaml",
    )
    c = ClusterNode(
        path="tpl",
        parent=None,
        child_files=["a"],
        child_clusters=[],
        kind="folder",
    )
    e = Edge("a", "a", "d-aggregate", None, attrs={"order": 3})
    g = Graph(root="r", files=[f], edges=[e], clusters=[c])
    payload = _json.loads(to_json(g))
    assert payload["version"] == 2
    assert payload["clusters"][0]["childFiles"] == ["a"]
    assert payload["files"][0]["generated"] is True
    assert payload["files"][0]["generatedFrom"] == "tpl/manifest.yaml"
    assert payload["edges"][0]["attrs"] == {"order": 3}
