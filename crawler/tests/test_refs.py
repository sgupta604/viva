from __future__ import annotations

from crawler.graph import FileNode, ParamNode, RawRef
from crawler.refs import resolve_references


def _file(id_, path, params=None, raw_refs=None):
    return FileNode(
        id=id_,
        path=path,
        name=path.rsplit("/", 1)[-1],
        folder=path.rsplit("/", 1)[0] if "/" in path else "",
        kind="xml",
        size_bytes=0,
        params=list(params or []),
        raw_refs=list(raw_refs or []),
    )


def test_resolves_relative_path_include():
    radar = _file(
        "r", "config/radar.xml",
        raw_refs=[RawRef(kind="include", raw="../shared/common.xml")],
    )
    common = _file("c", "shared/common.xml")
    edges = resolve_references([radar, common])
    assert len(edges) == 1
    assert edges[0].source == "r"
    assert edges[0].target == "c"
    assert edges[0].kind == "include"
    assert edges[0].unresolved is None


def test_resolves_global_ref_id():
    ingestion = _file(
        "i", "config/ingestion.xml",
        raw_refs=[RawRef(kind="ref", raw="radar.threshold_rain")],
    )
    radar = _file(
        "r", "config/radar.xml",
        params=[ParamNode("radar.threshold_rain", "0.25", "scalar", 1)],
    )
    edges = resolve_references([ingestion, radar])
    assert edges[0].target == "r"
    assert edges[0].unresolved is None


def test_resolves_path_import():
    ingestion = _file(
        "i", "config/ingestion.xml",
        raw_refs=[RawRef(kind="import", raw="../pipelines/main.yaml")],
    )
    main = _file("m", "pipelines/main.yaml")
    edges = resolve_references([ingestion, main])
    assert edges[0].kind == "import"
    assert edges[0].target == "m"


def test_unresolved_when_nothing_matches():
    ghost = _file(
        "g", "dangling/ghost-ref.xml",
        raw_refs=[RawRef(kind="ref", raw="nothing.matches")],
    )
    edges = resolve_references([ghost])
    assert edges[0].target is None
    assert edges[0].unresolved == "nothing.matches"


def test_unresolved_path():
    ghost = _file(
        "g", "dangling/ghost-ref.xml",
        raw_refs=[RawRef(kind="include", raw="../nonexistent/missing.xml")],
    )
    edges = resolve_references([ghost])
    assert edges[0].target is None
    assert edges[0].unresolved == "../nonexistent/missing.xml"


def test_ambiguous_global_id():
    a = _file(
        "a", "a.xml",
        params=[ParamNode("shared.key", "1", "scalar", None)],
    )
    b = _file(
        "b", "b.xml",
        params=[ParamNode("shared.key", "2", "scalar", None)],
    )
    user = _file(
        "u", "u.xml",
        raw_refs=[RawRef(kind="ref", raw="shared.key")],
    )
    edges = resolve_references([a, b, user])
    u_edges = [e for e in edges if e.source == "u"]
    assert u_edges[0].target is None
    assert u_edges[0].unresolved and u_edges[0].unresolved.startswith("ambiguous:")
