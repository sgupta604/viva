"""Logical-ID whitelist tests (polish-batch-1, item 3).

`--logical-id-whitelist` is an additive cap on top of the existing
specificity + cardinality filters. When supplied, only logical-IDs whose
name is in the whitelist may emit edges — everything else is silently
dropped (mirrors the cardinality cap's "no edge, not unresolved" behavior
so the graph stays clean per the user's "edges I can trust" rule).

Default (whitelist=None) and empty-set (whitelist=set()) are both treated
as "no filtering" so the existing fixture output stays byte-identical.
"""
from __future__ import annotations

from crawler.graph import FileNode, RawRef
from crawler.refs import resolve_references


def _decl(id_: str, lid: str) -> FileNode:
    f = FileNode(
        id=id_, path=f"{id_}.xml", name=f"{id_}.xml", folder="",
        kind="xml", size_bytes=0,
    )
    f.logical_id_declarations.add(lid)
    return f


def _ref(id_: str, lid: str) -> FileNode:
    return FileNode(
        id=id_, path=f"{id_}.xml", name=f"{id_}.xml", folder="",
        kind="xml", size_bytes=0,
        raw_refs=[RawRef(kind="logical-id", raw=lid)],
    )


def test_whitelist_none_preserves_existing_behavior():
    """Regression guard: whitelist=None → no filtering, existing behavior."""
    foo_decl = _decl("dfoo", "FOO_ID")
    bar_decl = _decl("dbar", "BAR_ID")
    referrer = FileNode(
        id="r", path="r.xml", name="r.xml", folder="",
        kind="xml", size_bytes=0,
        raw_refs=[
            RawRef(kind="logical-id", raw="FOO_ID"),
            RawRef(kind="logical-id", raw="BAR_ID"),
        ],
    )
    edges = resolve_references(
        [foo_decl, bar_decl, referrer], logical_id_whitelist=None,
    )
    logical = [e for e in edges if e.kind == "logical-id" and e.target is not None]
    targets = {e.target for e in logical}
    assert "dfoo" in targets and "dbar" in targets


def test_whitelist_empty_set_preserves_existing_behavior():
    """Empty whitelist treated identically to None — no filtering."""
    foo_decl = _decl("dfoo", "FOO_ID")
    referrer = _ref("r", "FOO_ID")
    edges = resolve_references(
        [foo_decl, referrer], logical_id_whitelist=set(),
    )
    logical = [e for e in edges if e.kind == "logical-id" and e.target is not None]
    assert any(e.target == "dfoo" for e in logical)


def test_whitelist_filters_non_listed_ids():
    """Only IDs in the whitelist emit edges; others are silently dropped."""
    foo_decl = _decl("dfoo", "FOO_ID")
    bar_decl = _decl("dbar", "BAR_ID")
    referrer = FileNode(
        id="r", path="r.xml", name="r.xml", folder="",
        kind="xml", size_bytes=0,
        raw_refs=[
            RawRef(kind="logical-id", raw="FOO_ID"),
            RawRef(kind="logical-id", raw="BAR_ID"),
        ],
    )
    edges = resolve_references(
        [foo_decl, bar_decl, referrer],
        logical_id_whitelist={"FOO_ID"},
    )
    logical = [e for e in edges if e.kind == "logical-id"]
    # FOO_ID resolves; BAR_ID is silently dropped (no unresolved row either).
    assert len(logical) == 1
    assert logical[0].target == "dfoo"


def test_whitelist_and_cardinality_cap_both_apply():
    """AND semantics: whitelisted ID still skipped if it busts the cap."""
    # 25 declarers of WHITELISTED_ID, cap=20, ID is in the whitelist —
    # cardinality cap still wins, no edge emitted.
    declarers = [_decl(f"d{i}", "WHITELISTED_ID") for i in range(25)]
    referrer = _ref("r", "WHITELISTED_ID")
    edges = resolve_references(
        declarers + [referrer],
        logical_id_max_cardinality=20,
        logical_id_whitelist={"WHITELISTED_ID"},
    )
    assert not [e for e in edges if e.kind == "logical-id"]


def test_cli_flag_parses_comma_list():
    """`--logical-id-whitelist a,b,c` → {'a', 'b', 'c'} on the parsed namespace."""
    from crawler.__main__ import _build_parser

    args = _build_parser().parse_args(
        ["/tmp/root", "--logical-id-whitelist", "a,b,c"],
    )
    # Storage shape can be raw string or pre-parsed set; we accept either,
    # but the value must round-trip into the {a, b, c} set after main()'s
    # parse step. Probe both: namespace attr present, and parse-helper
    # produces the expected set.
    from crawler.__main__ import _parse_logical_id_whitelist

    assert _parse_logical_id_whitelist(args.logical_id_whitelist) == {"a", "b", "c"}


def test_cli_flag_strips_per_item_whitespace():
    """`--logical-id-whitelist " a , b "` → {'a', 'b'} (no whitespace)."""
    from crawler.__main__ import _build_parser, _parse_logical_id_whitelist

    args = _build_parser().parse_args(
        ["/tmp/root", "--logical-id-whitelist", " a , b "],
    )
    assert _parse_logical_id_whitelist(args.logical_id_whitelist) == {"a", "b"}


def test_cli_flag_empty_string_treated_as_none():
    """`--logical-id-whitelist ""` → None (no filtering)."""
    from crawler.__main__ import _build_parser, _parse_logical_id_whitelist

    args = _build_parser().parse_args(
        ["/tmp/root", "--logical-id-whitelist", ""],
    )
    assert _parse_logical_id_whitelist(args.logical_id_whitelist) is None


def test_cli_flag_default_is_none():
    """Flag absent → namespace value falls through to None (no filtering)."""
    from crawler.__main__ import _build_parser, _parse_logical_id_whitelist

    args = _build_parser().parse_args(["/tmp/root"])
    assert _parse_logical_id_whitelist(args.logical_id_whitelist) is None
