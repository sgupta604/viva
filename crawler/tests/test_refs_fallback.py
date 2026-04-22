"""xi:fallback classification (C.4)."""
from __future__ import annotations

from pathlib import Path

from crawler import crawl


FIXTURES = Path(__file__).parent / "fixtures" / "sample-fallback"


def test_fallback_sibling_classifies_unresolved_with_prefix():
    graph = crawl(FIXTURES, no_timestamp=True)
    parent = next(f for f in graph.files if f.name == "parent.xml")
    parent_edges = [e for e in graph.edges if e.source == parent.id]
    assert parent_edges, "expected parent.xml to emit ≥1 edge"
    include_edges = [e for e in parent_edges if e.kind == "include"]
    assert include_edges
    assert include_edges[0].target is None
    assert include_edges[0].unresolved is not None
    assert include_edges[0].unresolved.startswith("fallback:")


def test_no_fallback_dangling_plain_unresolved():
    graph = crawl(FIXTURES, no_timestamp=True)
    parent = next(f for f in graph.files if f.name == "parent-no-fallback.xml")
    parent_edges = [e for e in graph.edges if e.source == parent.id]
    include_edges = [e for e in parent_edges if e.kind == "include"]
    assert include_edges
    assert include_edges[0].target is None
    # No prefix — plain raw value.
    assert include_edges[0].unresolved is not None
    assert not include_edges[0].unresolved.startswith("fallback:")


def test_fallback_does_not_produce_parse_error():
    graph = crawl(FIXTURES, no_timestamp=True)
    parent = next(f for f in graph.files if f.name == "parent.xml")
    assert parent.parse_error is None
