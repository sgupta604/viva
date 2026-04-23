"""Integration tests: build_d_aggregate_edges + crawl() (C.2)."""
from __future__ import annotations

from pathlib import Path

from crawler import crawl

FIXTURES = Path(__file__).parent / "fixtures" / "sample-d-dir"


def test_d_aggregate_edges_with_order():
    """foo.xml → foo.d/01-alpha.xml (order=1) and foo.d/02-beta.xml (order=2)."""
    graph = crawl(FIXTURES, no_timestamp=True)
    parent = next(f for f in graph.files if f.name == "foo.xml")
    child1 = next(f for f in graph.files if f.name == "01-alpha.xml")
    child2 = next(f for f in graph.files if f.name == "02-beta.xml")
    d_edges = [e for e in graph.edges if e.kind == "d-aggregate"]
    assert len(d_edges) == 2
    by_target = {e.target: e for e in d_edges}
    assert by_target[child1.id].source == parent.id
    assert by_target[child1.id].attrs == {"order": 1}
    assert by_target[child2.id].source == parent.id
    assert by_target[child2.id].attrs == {"order": 2}


def test_bar_d_without_sibling_emits_no_edges():
    """bar.d/ has NO sibling bar.xml → zero d-aggregate edges."""
    graph = crawl(FIXTURES, no_timestamp=True)
    orphan = next(f for f in graph.files if f.name == "orphan.xml")
    # No d-aggregate edge should target the orphan.
    assert not [e for e in graph.edges if e.kind == "d-aggregate" and e.target == orphan.id]


def test_cluster_kinds_reflect_pairing():
    graph = crawl(FIXTURES, no_timestamp=True)
    kinds = {c.path: c.kind for c in graph.clusters}
    assert kinds["foo.d"] == "d-aggregate"
    assert kinds["bar.d"] == "folder"


def test_recrawl_byte_stable():
    g1 = crawl(FIXTURES, no_timestamp=True).to_dict()
    g2 = crawl(FIXTURES, no_timestamp=True).to_dict()
    assert g1 == g2
