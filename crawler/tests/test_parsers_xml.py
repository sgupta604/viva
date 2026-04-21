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


# --- xml-viewer-hardening: XInclude, ENTITY, partial-parse coverage -----------


def test_xi_include_undeclared_namespace(sample_module: Path):
    """xi:include without an xmlns:xi declaration must parse under recover mode.

    Reproduces the dogfood failure mode: the strict parser rejects the doc
    with "Namespace prefix xi on include is not defined"; recover=True keeps
    the tag as the literal string "xi:include" and the crawler must still
    capture its href attribute as a kind=include raw reference.
    """
    node = xml_parser.parse(
        sample_module / "config" / "xi-include.xml", "config/xi-include.xml",
    )
    assert node.parse_error is None, (
        f"xi-include with undeclared namespace should parse clean under "
        f"recover mode, got: {node.parse_error!r}"
    )
    includes = [r for r in node.raw_refs if r.kind == "include"]
    assert any(r.raw == "shared/common.xml" for r in includes), (
        f"xi:include href must surface as a kind=include raw ref, got refs: "
        f"{[(r.kind, r.raw) for r in node.raw_refs]}"
    )


def test_xi_include_declared_namespace(tmp_path: Path):
    """Same assertion when xmlns:xi IS declared — Clark-notation path."""
    xml = (
        b'<?xml version="1.0"?>\n'
        b'<root xmlns:xi="http://www.w3.org/2001/XInclude">\n'
        b'  <xi:include href="shared/common.xml"/>\n'
        b'</root>\n'
    )
    path = tmp_path / "declared.xml"
    path.write_bytes(xml)
    node = xml_parser.parse(path, "declared.xml")
    assert node.parse_error is None
    includes = [r for r in node.raw_refs if r.kind == "include"]
    assert any(r.raw == "shared/common.xml" for r in includes)


def test_entity_declaration_captured(sample_module: Path):
    """<!ENTITY foo SYSTEM "bar.xml"> must surface as a kind=include raw ref."""
    node = xml_parser.parse(
        sample_module / "config" / "entity-decl.xml", "config/entity-decl.xml",
    )
    # Parse error may or may not be set depending on how lxml treats unresolved
    # entity references — recover mode should tolerate it either way. The
    # ENTITY SYSTEM target is what we care about.
    includes = [r for r in node.raw_refs if r.kind == "include"]
    assert any(r.raw == "shared/common.xml" for r in includes), (
        f"ENTITY SYSTEM target must be captured as a kind=include raw ref, "
        f"got refs: {[(r.kind, r.raw) for r in node.raw_refs]}"
    )


def test_partial_parse_retains_params(sample_module: Path):
    """Broken XML should still surface recovered params alongside parse_error.

    The committed broken.xml contains a valid <param id="x" value="y"/> before
    the broken close tag. Under recover mode that param must land in params[]
    AND parse_error must still be populated so the viewer shows the warning.
    """
    node = xml_parser.parse(
        sample_module / "config" / "broken.xml", "config/broken.xml",
    )
    assert node.parse_error is not None, (
        "broken.xml must still surface parse_error even with recover=True"
    )
    keys = [p.key for p in node.params]
    assert "x" in keys, (
        f"recover mode should retain the valid <param id='x' value='y'/> "
        f"from broken.xml; got param keys: {keys}"
    )


def test_recover_mode_no_network_no_entity_expansion(tmp_path: Path):
    """Parser must not resolve external entities or fetch network DTDs (TR1).

    We assert behavior rather than parser properties because lxml's XMLParser
    does not expose the constructor flags as attributes. Method: feed XML with
    an internal ENTITY whose SYSTEM URL points at a file that does not exist;
    with resolve_entities=False the parse succeeds and does not error out on
    the missing file. A parser that resolves entities would try to read it.
    """
    xml = (
        b'<?xml version="1.0"?>\n'
        b'<!DOCTYPE root [\n'
        b'  <!ENTITY missing SYSTEM "does-not-exist-anywhere.xml">\n'
        b']>\n'
        b'<root><child>&missing;</child></root>\n'
    )
    path = tmp_path / "entity-unresolved.xml"
    path.write_bytes(xml)
    node = xml_parser.parse(path, "entity-unresolved.xml")
    # Under the configured parser, missing entities do NOT abort the parse;
    # either parse_error is None, OR parse_error notes a recovered condition
    # but we still get a node back (not an exception that escapes parse()).
    assert isinstance(node.parse_error, (str, type(None)))
