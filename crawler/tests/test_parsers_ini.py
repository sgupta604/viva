from __future__ import annotations

from pathlib import Path

from crawler.parsers import ini as ini_parser


def test_preserves_key_case(units_root: Path):
    node = ini_parser.parse(units_root / "ini" / "case.ini", "ini/case.ini")
    assert node.parse_error is None
    keys = [p.key for p in node.params]
    assert "Section.KeyCase" in keys
    assert "Section.lower" in keys
    assert "Section.keycase" not in keys  # NOT lowercased


def test_rain_ini_has_threshold(sample_module: Path):
    node = ini_parser.parse(sample_module / "thresholds" / "rain.ini", "thresholds/rain.ini")
    assert node.parse_error is None
    keys = [p.key for p in node.params]
    assert "radar.threshold_rain" in keys
    assert "radar.threshold_snow" in keys


def test_cfg_with_mixed_case(sample_module: Path):
    node = ini_parser.parse(sample_module / "thresholds" / "wind.cfg", "thresholds/wind.cfg")
    assert node.parse_error is None
    keys = [p.key for p in node.params]
    assert "Wind.MaxSpeed" in keys
    assert "Wind.minSpeed" in keys
    assert "Wind.Direction" in keys
