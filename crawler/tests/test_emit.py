from __future__ import annotations

import hashlib
from pathlib import Path

from crawler.emit import to_json, write
from crawler.graph import Edge, FileNode, Graph, ParamNode


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
