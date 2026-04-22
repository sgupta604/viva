"""YAML parser using ruamel.yaml (safe mode).

- Uses `load_all` to handle multi-document streams (`---`).
- Resolves anchors/aliases via the safe loader.
- Captures `!include` tags as raw refs.
- Flattens nested maps to dotted keys; lists/maps become preview strings with
  `kind='list'` or `kind='map'`.
"""
from __future__ import annotations

import json as _json
from pathlib import Path
from typing import Any

from ruamel.yaml import YAML

from ..graph import FileNode, ParamNode, RawRef

INCLUDE_TAG = "!include"

# A sentinel class so `!include` survives the safe load as an in-memory marker.
class _Include:
    __slots__ = ("value",)

    def __init__(self, value: Any) -> None:
        self.value = value

    def __repr__(self) -> str:  # pragma: no cover
        return f"Include({self.value!r})"


def _make_loader() -> YAML:
    y = YAML(typ="safe")
    # ruamel requires registering the custom tag on the constructor.

    def _construct_include(loader, node):  # type: ignore[no-untyped-def]
        return _Include(loader.construct_scalar(node))

    y.constructor.add_constructor(INCLUDE_TAG, _construct_include)
    return y


def parse(abs_path: Path, rel_path: str) -> FileNode:
    node = FileNode(
        id="", path=rel_path, name=abs_path.name, folder="", kind="yaml", size_bytes=0,
    )
    try:
        y = _make_loader()
        with open(abs_path, "rb") as fh:
            # ruamel load_all returns a generator; materialize and iterate.
            docs = list(y.load_all(fh))
    except Exception as e:
        node.parse_error = f"{type(e).__name__}: {e}"
        return node

    for doc_idx, doc in enumerate(docs):
        doc_prefix = f"doc{doc_idx}" if len(docs) > 1 else ""
        _flatten(doc, doc_prefix, node, line=None)

    return node


def _flatten(obj: Any, prefix: str, node: FileNode, line: int | None) -> None:
    if isinstance(obj, _Include):
        node.raw_refs.append(RawRef(kind="include", raw=str(obj.value)))
        if prefix:
            node.params.append(ParamNode(key=prefix, value=f"!include {obj.value}", kind="scalar", line=line))
        return
    if isinstance(obj, dict):
        if not obj:
            return
        # Scan for !include nested inside a map value
        for k, v in obj.items():
            key = f"{prefix}.{k}" if prefix else str(k)
            _flatten(v, key, node, line)
        return
    if isinstance(obj, list):
        preview = _preview(obj, depth=2)
        if prefix:
            node.params.append(ParamNode(key=prefix, value=preview, kind="list", line=line))
        return
    # scalar
    if prefix:
        node.params.append(ParamNode(key=prefix, value=_scalar_str(obj), kind="scalar", line=line))


def _preview(v: Any, depth: int) -> str:
    def _prune(x: Any, d: int) -> Any:
        if d <= 0:
            if isinstance(x, (dict, list)):
                return "..."
            return x
        if isinstance(x, _Include):
            return f"!include {x.value}"
        if isinstance(x, dict):
            return {str(k): _prune(val, d - 1) for k, val in x.items()}
        if isinstance(x, list):
            return [_prune(item, d - 1) for item in x]
        return x
    try:
        pruned = _prune(v, depth)
        out = _json.dumps(pruned, default=str, sort_keys=True)
    except Exception:
        out = str(v)
    return out.replace("\n", " ")


def _scalar_str(v: Any) -> str:
    if v is None:
        return ""
    if isinstance(v, bool):
        return "true" if v else "false"
    return str(v)
