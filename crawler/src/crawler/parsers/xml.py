"""XML parser using lxml.

- Opens binary to let lxml honor the declared encoding.
- Captures parse errors into `FileNode.parse_error` instead of raising.
- Extracts params from any element with an `id`/`value` pair or from attribute
  triples like `<param id="x" value="y"/>`; additionally captures plain-leaf
  elements as `element_path=text` params.
- Collects raw refs from `<include file="…"/>`, `<ref id="…"/>`, `<import path="…"/>`.
"""
from __future__ import annotations

from pathlib import Path

from lxml import etree

from ..graph import FileNode, ParamNode, RawRef


def parse(abs_path: Path, rel_path: str) -> FileNode:
    node = FileNode(
        id="", path=rel_path, name=abs_path.name, folder="", kind="xml", size_bytes=0,
    )
    try:
        with open(abs_path, "rb") as fh:
            data = fh.read()
        # lxml parses bytes and honors the XML declaration's encoding attribute.
        tree = etree.fromstring(data)
    except etree.XMLSyntaxError as e:
        node.parse_error = f"XMLSyntaxError: {e}"
        return node
    except Exception as e:  # pragma: no cover — defensive
        node.parse_error = f"{type(e).__name__}: {e}"
        return node

    _walk(tree, "", node)
    return node


def _walk(elem: etree._Element, prefix: str, node: FileNode) -> None:
    # Reference collection
    tag = _local_name(elem.tag)
    line = elem.sourceline if hasattr(elem, "sourceline") else None

    if tag == "include":
        target = elem.get("file") or elem.get("path")
        if target:
            node.raw_refs.append(RawRef(kind="include", raw=target))
    elif tag == "ref":
        target = elem.get("id") or elem.get("path")
        if target:
            node.raw_refs.append(RawRef(kind="ref", raw=target))
    elif tag == "import":
        target = elem.get("path") or elem.get("file")
        if target:
            node.raw_refs.append(RawRef(kind="import", raw=target))

    # Param extraction:
    # 1) <param id="..." value="..."/>  (or any element with id+value attrs)
    pid = elem.get("id")
    pval = elem.get("value")
    if pid and pval is not None:
        node.params.append(ParamNode(key=pid, value=str(pval), kind="scalar", line=line))

    # 2) Leaf text content: emit <path/to/element>=<text>
    text = (elem.text or "").strip()
    if text and len(elem) == 0 and tag not in {"include", "ref", "import"}:
        key = f"{prefix}.{tag}" if prefix else tag
        node.params.append(ParamNode(key=key, value=text, kind="scalar", line=line))

    # Recurse
    child_prefix = f"{prefix}.{tag}" if prefix else tag
    for child in elem:
        _walk(child, child_prefix, node)


def _local_name(tag: str) -> str:
    """Strip XML namespace — we treat tags as local names for params/refs."""
    if isinstance(tag, str) and "}" in tag:
        return tag.split("}", 1)[1]
    return tag if isinstance(tag, str) else ""
