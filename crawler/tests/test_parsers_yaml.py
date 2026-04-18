from __future__ import annotations

from pathlib import Path

from crawler.parsers import yaml as yaml_parser


def test_parses_basic_yaml(units_root: Path):
    node = yaml_parser.parse(units_root / "yaml" / "basic.yaml", "yaml/basic.yaml")
    assert node.parse_error is None
    keys = [p.key for p in node.params]
    assert "name" in keys
    assert "count" in keys
    # items is a list-valued param at top level
    assert any(p.key == "items" and p.kind == "list" for p in node.params)


def test_anchors_resolve(sample_module: Path):
    node = yaml_parser.parse(sample_module / "pipelines" / "anchors.yaml", "pipelines/anchors.yaml")
    assert node.parse_error is None
    keys = [p.key for p in node.params]
    # job_a inherits from &defaults
    assert "job_a.retries" in keys
    assert "job_a.timeout_s" in keys
    # job_b overrides retries
    retries_b = next(p for p in node.params if p.key == "job_b.retries")
    assert retries_b.value == "5"


def test_multi_doc_yaml(sample_module: Path):
    node = yaml_parser.parse(
        sample_module / "pipelines" / "secondary.yml", "pipelines/secondary.yml",
    )
    assert node.parse_error is None
    keys = [p.key for p in node.params]
    assert any(k.startswith("doc0.") for k in keys)
    assert any(k.startswith("doc1.") for k in keys)


def test_include_tag_emits_raw_ref(sample_module: Path):
    node = yaml_parser.parse(sample_module / "pipelines" / "main.yaml", "pipelines/main.yaml")
    assert node.parse_error is None
    assert any(r.kind == "include" and "defaults.json" in r.raw for r in node.raw_refs)
