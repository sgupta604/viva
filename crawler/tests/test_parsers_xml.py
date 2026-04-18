from __future__ import annotations

from pathlib import Path

from crawler.parsers import xml as xml_parser


def test_parses_simple_xml(units_root: Path):
    node = xml_parser.parse(units_root / "xml" / "simple.xml", "xml/simple.xml")
    assert node.parse_error is None
    keys = [p.key for p in node.params]
    assert "a.b" in keys
    assert "c" in keys


def test_captures_refs(units_root: Path):
    node = xml_parser.parse(units_root / "xml" / "refs.xml", "xml/refs.xml")
    kinds = {r.kind for r in node.raw_refs}
    assert kinds == {"include", "ref", "import"}


def test_broken_xml_yields_parse_error(sample_module: Path):
    node = xml_parser.parse(sample_module / "config" / "broken.xml", "config/broken.xml")
    assert node.parse_error is not None


def test_encoding_latin1_declaration_parses(sample_module: Path):
    node = xml_parser.parse(
        sample_module / "config" / "encoding-latin1.xml", "config/encoding-latin1.xml",
    )
    assert node.parse_error is None


def test_radar_xml_emits_include(sample_module: Path):
    node = xml_parser.parse(sample_module / "config" / "radar.xml", "config/radar.xml")
    assert node.parse_error is None
    includes = [r for r in node.raw_refs if r.kind == "include"]
    assert any("common.xml" in r.raw for r in includes)


def test_param_line_numbers(sample_module: Path):
    node = xml_parser.parse(sample_module / "config" / "radar.xml", "config/radar.xml")
    threshold = next((p for p in node.params if p.key == "radar.threshold_rain"), None)
    assert threshold is not None
    assert threshold.line is not None and threshold.line >= 1
