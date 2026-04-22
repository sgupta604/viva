"""Logical-ID indexing tests (C.3).

Rules under test:
  - `model-id` / `scheme` attrs on any tag are references
  - `id` / `model-id` / `scheme` / `name` on declarer tags (param/entry/
    item/catalogue/scheme) register declarations
  - single-char / pure-digit IDs are skipped (specificity)
  - IDs declared by > max_cardinality files are skipped (cardinality)
"""
from __future__ import annotations

from pathlib import Path

from crawler import crawl
from crawler.graph import FileNode, RawRef
from crawler.refs import resolve_references

FIXTURES = Path(__file__).parent / "fixtures" / "sample-logical-id"


def test_specific_id_links_files():
    """referrer.xml `model-id=SPECIFIC_ID_42` → edge to declarer.xml."""
    graph = crawl(FIXTURES, no_timestamp=True)
    referrer = next(f for f in graph.files if f.name == "referrer.xml")
    declarer = next(f for f in graph.files if f.name == "declarer.xml")
    logical = [e for e in graph.edges if e.kind == "logical-id" and e.source == referrer.id]
    assert logical, "expected ≥1 logical-id edge from referrer"
    assert any(e.target == declarer.id for e in logical)


def test_scheme_attr_also_links():
    """referrer.xml `scheme=ENTRY_ALPHA` → edge to declarer.xml via <entry name=...>."""
    graph = crawl(FIXTURES, no_timestamp=True)
    referrer = next(f for f in graph.files if f.name == "referrer.xml")
    declarer = next(f for f in graph.files if f.name == "declarer.xml")
    logical = [e for e in graph.edges if e.kind == "logical-id" and e.source == referrer.id]
    # Both SPECIFIC_ID_42 and ENTRY_ALPHA should resolve.
    assert len(logical) >= 2
    targets = {e.target for e in logical}
    assert declarer.id in targets


def test_integer_id_skipped():
    """Pure-integer IDs (`id='1'`) are skipped by specificity cap."""
    # Synthesize: file A declares id="1", file B has <use model-id="1"/>
    a = FileNode(id="a", path="a.xml", name="a.xml", folder="",
                 kind="xml", size_bytes=0)
    a.logical_id_declarations.add("1")
    b = FileNode(id="b", path="b.xml", name="b.xml", folder="",
                 kind="xml", size_bytes=0,
                 raw_refs=[RawRef(kind="logical-id", raw="1")])
    edges = resolve_references([a, b])
    # No edge should be emitted — the ref is silently dropped.
    assert not [e for e in edges if e.kind == "logical-id"]


def test_single_letter_id_skipped():
    """Single-character IDs are skipped."""
    a = FileNode(id="a", path="a.xml", name="a.xml", folder="",
                 kind="xml", size_bytes=0)
    a.logical_id_declarations.add("Z")
    b = FileNode(id="b", path="b.xml", name="b.xml", folder="",
                 kind="xml", size_bytes=0,
                 raw_refs=[RawRef(kind="logical-id", raw="Z")])
    edges = resolve_references([a, b])
    assert not [e for e in edges if e.kind == "logical-id"]


def test_cardinality_cap():
    """ID declared by > max cardinality files → no edges emitted."""
    # 25 declarers + 1 referrer with cap=20 → zero edges.
    declarers = []
    for i in range(25):
        f = FileNode(id=f"d{i}", path=f"d{i}.xml", name=f"d{i}.xml",
                     folder="", kind="xml", size_bytes=0)
        f.logical_id_declarations.add("COMMON_ID_42")
        declarers.append(f)
    referrer = FileNode(
        id="r", path="r.xml", name="r.xml", folder="",
        kind="xml", size_bytes=0,
        raw_refs=[RawRef(kind="logical-id", raw="COMMON_ID_42")],
    )
    edges = resolve_references(
        declarers + [referrer], logical_id_max_cardinality=20,
    )
    assert not [e for e in edges if e.kind == "logical-id"]


def test_cli_flag_parses():
    from crawler.__main__ import _build_parser

    args = _build_parser().parse_args(
        ["/tmp/root", "--logical-id-max-cardinality", "5"],
    )
    assert args.logical_id_max_cardinality == 5


def test_dangling_logical_id_records_unresolved():
    """Reference to an undeclared ID records an unresolved edge (no target)."""
    b = FileNode(id="b", path="b.xml", name="b.xml", folder="",
                 kind="xml", size_bytes=0,
                 raw_refs=[RawRef(kind="logical-id", raw="UNDECLARED_XYZ")])
    edges = resolve_references([b])
    dangling = [e for e in edges if e.kind == "logical-id"]
    assert len(dangling) == 1
    assert dangling[0].target is None
    assert dangling[0].unresolved == "UNDECLARED_XYZ"
