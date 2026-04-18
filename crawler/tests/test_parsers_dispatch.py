from __future__ import annotations

from pathlib import Path

from crawler.parsers import kind_for_extension, parse_file


def test_unknown_extension_returns_none(tmp_path: Path):
    md = tmp_path / "README.md"
    md.write_text("# hello", encoding="utf-8")
    assert parse_file("README.md", md) is None


def test_known_extensions_dispatch():
    assert kind_for_extension(".xml") == "xml"
    assert kind_for_extension(".yaml") == "yaml"
    assert kind_for_extension(".yml") == "yaml"
    assert kind_for_extension(".json") == "json"
    assert kind_for_extension(".ini") == "ini"
    assert kind_for_extension(".cfg") == "ini"
    assert kind_for_extension(".md") is None


def test_parse_file_fills_contract_fields(sample_module: Path):
    abs_path = sample_module / "config" / "radar.xml"
    node = parse_file("config/radar.xml", abs_path)
    assert node is not None
    assert node.id and len(node.id) == 10
    assert node.path == "config/radar.xml"
    assert node.name == "radar.xml"
    assert node.folder == "config"
    assert node.kind == "xml"
    assert node.size_bytes > 0
    assert node.is_test is False


def test_parse_file_marks_tests(sample_module: Path):
    abs_path = sample_module / "tests" / "test_radar.xml"
    node = parse_file("tests/test_radar.xml", abs_path)
    assert node is not None
    assert node.is_test is True
