"""JSON parser using stdlib json.

- Flattens nested maps to dotted keys.
- Detects `{ "$include": "..." }` as a raw ref of kind `include`.
- Detects top-level string values that look like path references (contain a `/`
  or `\\` and end in a known extension) as path imports.
"""
from __future__ import annotations

import json as _json
from pathlib import Path
from typing import Any, Optional

from ..graph import FileNode, ParamNode, RawRef

_REF_EXTS = (".xml", ".yaml", ".yml", ".json", ".ini", ".cfg")


def parse(abs_path: Path, rel_path: str) -> FileNode:
    node = FileNode(
        id="", path=rel_path, name=abs_path.name, folder="", kind="json", size_bytes=0,
    )
    try:
        with open(abs_path, "rb") as fh:
            data = _json.load(fh)
    except _json.JSONDecodeError as e:
        node.parse_error = f"JSONDecodeError: {e}"
        return node
    except Exception as e:  # pragma: no cover — defensive
        node.parse_error = f"{type(e).__name__}: {e}"
        return node

    _flatten(data, "", node, line=None)
    return node


def _flatten(obj: Any, prefix: str, node: FileNode, line: Optional[int]) -> None:
    if isinstance(obj, dict):
        # $include shortcut
        inc = obj.get("$include")
        if isinstance(inc, str):
            node.raw_refs.append(RawRef(kind="include", raw=inc))
        for k, v in obj.items():
            if k == "$include" and isinstance(v, str):
                continue
            key = f"{prefix}.{k}" if prefix else str(k)
            _flatten(v, key, node, line)
        if not obj and prefix:
            node.params.append(ParamNode(key=prefix, value="{}", kind="map", line=line))
        return
    if isinstance(obj, list):
        preview = _preview(obj, depth=2)
        if prefix:
            node.params.append(ParamNode(key=prefix, value=preview, kind="list", line=line))
        return
    # scalar
    if prefix:
        sv = _scalar_str(obj)
        # path-style import detection
        if isinstance(obj, str) and ("/" in obj or "\\" in obj) and obj.lower().endswith(_REF_EXTS):
            node.raw_refs.append(RawRef(kind="import", raw=obj))
        node.params.append(ParamNode(key=prefix, value=sv, kind="scalar", line=line))


def _preview(v: Any, depth: int) -> str:
    def _prune(x: Any, d: int) -> Any:
        if d <= 0 and isinstance(x, (dict, list)):
            return "..."
        if isinstance(x, dict):
            return {str(k): _prune(val, d - 1) for k, val in x.items()}
        if isinstance(x, list):
            return [_prune(item, d - 1) for item in x]
        return x
    try:
        return _json.dumps(_prune(v, depth), default=str, sort_keys=True).replace("\n", " ")
    except Exception:
        return str(v)


def _scalar_str(v: Any) -> str:
    if v is None:
        return ""
    if isinstance(v, bool):
        return "true" if v else "false"
    return str(v)
