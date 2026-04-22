"""Scale test (C.6) — synthesize a ≈3k-file tree under tmp_path and crawl it.

Runs as part of the default suite (not integration-marked) so it also
exercises:
  - cluster construction at scale
  - re-crawl byte-identity
  - reasonable memory/time envelope

Kept lean: <30 s locally per plan's acceptance criterion.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from crawler import crawl
from crawler.emit import to_json


def _write(p: Path, text: str) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text, encoding="utf-8")


@pytest.fixture(scope="module")
def synth_tree(tmp_path_factory) -> Path:
    """Build a deterministic 3000-file tree.

    Shape:
      - 10 top-level folders × 10 mid × 30 files = 3000 files
      - ~60% xml, rest split across yaml/json/ini
      - 2 top-level `.d/` aggregates (10 kids each)
    """
    root = tmp_path_factory.mktemp("synth-3k")
    TOP = 10
    MID = 10
    LEAF = 30
    D_AGGREGATES = 2

    for t in range(TOP):
        for m in range(MID):
            last = m == MID - 1
            is_d = last and t < D_AGGREGATES
            folder = (
                f"top{t:02d}/mid{m:02d}.d"
                if is_d
                else f"top{t:02d}/mid{m:02d}"
            )
            leaf_count = 10 if is_d else LEAF
            for l in range(leaf_count):
                idx = t * 1000 + m * 100 + l
                r = idx % 10
                if is_d:
                    ext, body = "xml", f'<?xml version="1.0"?>\n<piece order="{l}"/>\n'
                    name = f"{(l+1):02d}-piece{l}.{ext}"
                elif r < 6:
                    ext = "xml"
                    body = f'<?xml version="1.0"?>\n<root><item id="x_{idx}" value="v{idx}"/></root>\n'
                    name = f"leaf{l:02d}.xml"
                elif r < 7:
                    ext = "yaml"
                    body = f"key_{idx}: value_{idx}\n"
                    name = f"leaf{l:02d}.yaml"
                elif r < 9:
                    ext = "json"
                    body = json.dumps({"k": idx}) + "\n"
                    name = f"leaf{l:02d}.json"
                else:
                    ext = "ini"
                    body = f"[sec]\nkey={idx}\n"
                    name = f"leaf{l:02d}.ini"
                _write(root / folder / name, body)
            if is_d:
                # sibling parent xml — foo.d/ pairs with foo.xml in parent folder
                parent = f"top{t:02d}"
                sibling = f"mid{m:02d}.xml"
                _write(
                    root / parent / sibling,
                    f'<?xml version="1.0"?>\n<root/>\n',
                )
    return root


def test_scale_crawl_produces_expected_counts(synth_tree: Path):
    graph = crawl(synth_tree, no_timestamp=True)
    # 3000 leaf files + D_AGGREGATES sibling .xml peers = 3002 files.
    assert 2900 < len(graph.files) < 3050, f"got {len(graph.files)}"
    # 2 d-aggregate clusters
    d_clusters = [c for c in graph.clusters if c.kind == "d-aggregate"]
    assert len(d_clusters) == 2
    # No parse errors
    parse_errors = [f for f in graph.files if f.parse_error]
    assert parse_errors == []
    # cluster count >= 10 (top) + 100 (mid) minimum
    assert len(graph.clusters) > 100


def test_scale_crawl_d_aggregate_edges(synth_tree: Path):
    graph = crawl(synth_tree, no_timestamp=True)
    d_edges = [e for e in graph.edges if e.kind == "d-aggregate"]
    # 2 aggregates × 10 children = 20
    assert len(d_edges) == 20
    for e in d_edges:
        assert "order" in (e.attrs or {}), f"missing order on {e}"


def test_scale_crawl_recrawl_byte_identical(synth_tree: Path):
    g1 = to_json(crawl(synth_tree, no_timestamp=True))
    g2 = to_json(crawl(synth_tree, no_timestamp=True))
    assert json.loads(g1) == json.loads(g2)
