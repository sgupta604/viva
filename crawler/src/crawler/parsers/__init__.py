"""Parser dispatch by file extension.

Each parser is independent — no parser imports another. lxml types must not
escape `parsers/xml.py`; ruamel types must not escape `parsers/yaml.py`.
"""
from __future__ import annotations

from pathlib import Path
from typing import Callable, Optional

from ..discovery import is_test_path
from ..graph import FileKind, FileNode, stable_id
from . import ini as ini_parser
from . import json_ as json_parser
from . import xml as xml_parser
from . import yaml as yaml_parser

ParseFn = Callable[[Path, str], FileNode]

_EXT_TO_PARSER: dict[str, tuple[FileKind, ParseFn]] = {
    ".xml": ("xml", xml_parser.parse),
    # XSD is an XML document; route through the xml parser so xsi:* attrs on
    # consumers resolve to the .xsd file as a graph node. kind stays "xml" —
    # v2 schema keeps FileKind a closed 4-enum to avoid a cascading
    # FileNode.kind change across the viewer. Distinguish XSD visually later
    # via the file extension, not a new FileKind.
    ".xsd": ("xml", xml_parser.parse),
    ".yaml": ("yaml", yaml_parser.parse),
    ".yml": ("yaml", yaml_parser.parse),
    ".json": ("json", json_parser.parse),
    ".ini": ("ini", ini_parser.parse),
    ".cfg": ("ini", ini_parser.parse),
}


def parse_file(rel_posix_path: str, abs_path: Path) -> Optional[FileNode]:
    """Dispatch to the right parser. Returns None for unknown extensions."""
    entry = _EXT_TO_PARSER.get(abs_path.suffix.lower())
    if entry is None:
        return None
    kind, fn = entry
    node = fn(abs_path, rel_posix_path)
    # Fill contract fields the parser doesn't know.
    node.id = stable_id(rel_posix_path)
    node.path = rel_posix_path
    node.name = abs_path.name
    node.folder = rel_posix_path.rsplit("/", 1)[0] if "/" in rel_posix_path else ""
    node.kind = kind
    node.size_bytes = abs_path.stat().st_size
    node.is_test = is_test_path(rel_posix_path)
    return node


def kind_for_extension(ext: str) -> Optional[FileKind]:
    entry = _EXT_TO_PARSER.get(ext.lower())
    return entry[0] if entry else None
