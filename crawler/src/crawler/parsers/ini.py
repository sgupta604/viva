"""INI / .cfg parser using stdlib configparser.

- `optionxform = str` preserves original case.
- Disables interpolation to keep values verbatim.
- Emits `section.key = value` params. No cross-file refs from INI in v1.
"""
from __future__ import annotations

import configparser
from pathlib import Path

from ..graph import FileNode, ParamNode


def parse(abs_path: Path, rel_path: str) -> FileNode:
    node = FileNode(
        id="", path=rel_path, name=abs_path.name, folder="", kind="ini", size_bytes=0,
    )
    cp = configparser.ConfigParser(interpolation=None, strict=False)
    cp.optionxform = str  # type: ignore[assignment]
    try:
        with open(abs_path, "r", encoding="utf-8") as fh:
            cp.read_file(fh)
    except configparser.Error as e:
        node.parse_error = f"{type(e).__name__}: {e}"
        return node
    except UnicodeDecodeError:
        try:
            with open(abs_path, "r", encoding="latin-1") as fh:
                cp.read_file(fh)
        except Exception as e:
            node.parse_error = f"{type(e).__name__}: {e}"
            return node
    except Exception as e:  # pragma: no cover
        node.parse_error = f"{type(e).__name__}: {e}"
        return node

    for section in cp.sections():
        for key, value in cp.items(section):
            node.params.append(ParamNode(key=f"{section}.{key}", value=str(value), kind="scalar", line=None))
    if cp.defaults():
        for key, value in cp.defaults().items():
            node.params.append(ParamNode(key=key, value=str(value), kind="scalar", line=None))
    return node
