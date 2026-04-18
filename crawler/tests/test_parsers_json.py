from __future__ import annotations

from pathlib import Path

from crawler.parsers import json_ as json_parser


def test_nested_json_flattened(units_root: Path):
    node = json_parser.parse(units_root / "json" / "nested.json", "json/nested.json")
    assert node.parse_error is None
    keys = [p.key for p in node.params]
    assert "a.b.c" in keys
    # list kept as a single 'list'-kind param
    assert any(p.key == "xs" and p.kind == "list" for p in node.params)


def test_include_shortcut_detected(sample_module: Path):
    node = json_parser.parse(sample_module / "environments" / "dev.json", "environments/dev.json")
    assert node.parse_error is None
    assert any(r.kind == "include" and "ingestion.xml" in r.raw for r in node.raw_refs)
