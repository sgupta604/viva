from __future__ import annotations

from pathlib import Path

from crawler import crawl

FIXTURES = Path(__file__).parent / "fixtures" / "sample-xsd"


def test_xsd_schema_location_edge():
    """schemaLocation pair (namespace + location) resolves to the .xsd file."""
    graph = crawl(FIXTURES, no_timestamp=True)
    xsd_edges = [e for e in graph.edges if e.kind == "xsd"]
    assert xsd_edges, "expected at least 1 xsd edge"
    # config.xml declares schemaLocation to schema.xsd
    # The source is config.xml; target is schema.xsd.
    config = next(f for f in graph.files if f.name == "config.xml")
    schema = next(f for f in graph.files if f.name == "schema.xsd")
    resolved = [
        e for e in xsd_edges
        if e.source == config.id and e.target == schema.id
    ]
    assert len(resolved) == 1, f"expected exactly 1 edge config.xml → schema.xsd, got {resolved!r}"


def test_noNamespaceSchemaLocation_edge():
    """noNamespaceSchemaLocation resolves to the sibling .xsd file."""
    graph = crawl(FIXTURES, no_timestamp=True)
    xsd_edges = [e for e in graph.edges if e.kind == "xsd"]
    config = next(f for f in graph.files if f.name == "config.xml")
    nons = next(f for f in graph.files if f.name == "nons.xsd")
    resolved = [
        e for e in xsd_edges
        if e.source == config.id and e.target == nons.id
    ]
    assert len(resolved) == 1


def test_xsd_dangling_unresolved():
    """Missing schema location records an unresolved xsd edge."""
    graph = crawl(FIXTURES, no_timestamp=True)
    dangling = next(f for f in graph.files if f.name == "dangling.xml")
    dangling_edges = [e for e in graph.edges if e.source == dangling.id and e.kind == "xsd"]
    assert dangling_edges, "expected an xsd edge from dangling.xml"
    assert all(e.target is None for e in dangling_edges)


def test_xsd_does_not_self_emit():
    """XSD source files do not emit xsd edges themselves."""
    graph = crawl(FIXTURES, no_timestamp=True)
    # schema.xsd parses as an xml document — ensure it has zero xsd raw_refs.
    # (We can check via emitted edges: no xsd edge originates from an .xsd
    # file.)
    xsd_files_ids = {f.id for f in graph.files if f.path.endswith(".xsd")}
    offenders = [
        e for e in graph.edges
        if e.kind == "xsd" and e.source in xsd_files_ids
    ]
    assert offenders == []


def test_recrawl_byte_stable():
    """C.6 re-crawl invariant for this fixture."""
    g1 = crawl(FIXTURES, no_timestamp=True).to_dict()
    g2 = crawl(FIXTURES, no_timestamp=True).to_dict()
    assert g1 == g2
