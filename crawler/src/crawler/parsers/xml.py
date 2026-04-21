"""XML parser using lxml.

- Opens binary to let lxml honor the declared encoding.
- Uses `recover=True` so real-world XML (undeclared namespaces on xi:include,
  partial content) produces a node with whatever the recoverable tree contains,
  plus the first error message in `parse_error`.
- `resolve_entities=False` + `no_network=True` keep the parser offline — belt
  and suspenders for the TR1 offline guarantee.
- Extracts params from any element with an `id`/`value` pair or from
  leaf-text elements (`element_path=text`).
- Collects raw refs from `<include file|path|href="…"/>`, `<ref id="…"/>`,
  `<import path="…"/>`, and from `<!ENTITY name SYSTEM "…">` decls.
"""
from __future__ import annotations

from pathlib import Path

from lxml import etree

from ..graph import FileNode, ParamNode, RawRef


def _make_parser() -> etree.XMLParser:
    """Factory for the hardened XML parser.

    Centralized so test + prod share the exact same config (TR1 offline).
    """
    return etree.XMLParser(recover=True, resolve_entities=False, no_network=True)


def parse(abs_path: Path, rel_path: str) -> FileNode:
    node = FileNode(
        id="", path=rel_path, name=abs_path.name, folder="", kind="xml", size_bytes=0,
    )
    try:
        with open(abs_path, "rb") as fh:
            data = fh.read()
    except Exception as e:  # pragma: no cover — defensive
        node.parse_error = f"{type(e).__name__}: {e}"
        return node

    parser = _make_parser()
    try:
        # lxml parses bytes and honors the XML declaration's encoding attribute.
        tree = etree.fromstring(data, parser)
    except etree.XMLSyntaxError as e:
        # recover=True makes this branch exceptional — it fires only when the
        # document is so malformed lxml cannot produce ANY tree. Preserve the
        # original error shape so downstream tests and UI don't change.
        node.parse_error = f"XMLSyntaxError: {e}"
        return node
    except Exception as e:  # pragma: no cover — defensive
        node.parse_error = f"{type(e).__name__}: {e}"
        return node

    # Capture the first *structural* recovery error, if any, so the UI can
    # flag the file. Skip undeclared-namespace warnings: recover mode handles
    # those cleanly (xi:include tag survives as a literal string and the
    # `prefix:local` branch of _local_name picks it up). Flagging them as
    # parse errors would spam the dogfood crawl on every real-world XInclude.
    structural = [
        e for e in parser.error_log
        if e.type_name != "NS_ERR_UNDEFINED_NAMESPACE"
    ]
    if structural:
        first = structural[0]
        node.parse_error = f"XMLSyntaxError: {first.message} (line {first.line})"

    # Collect ENTITY declarations from the internal DTD (if present). Each
    # SYSTEM entity surfaces as a kind=include raw ref. lxml returns the
    # root-element parse; we walk back to the tree to reach docinfo.
    if tree is not None:
        _collect_entity_refs(tree, node)
        _walk(tree, "", node)

    return node


def _collect_entity_refs(elem: etree._Element, node: FileNode) -> None:
    """Surface <!ENTITY name SYSTEM "..."> decls as kind=include raw refs."""
    try:
        doctree = elem.getroottree()
        docinfo = doctree.docinfo
        internal_dtd = docinfo.internalDTD
    except Exception:  # pragma: no cover — defensive on older lxml
        return
    if internal_dtd is None:
        return
    try:
        entities = list(internal_dtd.iterentities())
    except Exception:  # pragma: no cover — defensive on older lxml
        return
    for ent in entities:
        system_url = getattr(ent, "system_url", None)
        if system_url:
            node.raw_refs.append(RawRef(kind="include", raw=system_url))


def _walk(elem: etree._Element, prefix: str, node: FileNode) -> None:
    # Reference collection
    tag = _local_name(elem.tag)
    line = elem.sourceline if hasattr(elem, "sourceline") else None

    if tag == "include":
        # XInclude uses href; legacy/other forms use file or path.
        target = elem.get("file") or elem.get("path") or elem.get("href")
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
    """Strip XML namespace — we treat tags as local names for params/refs.

    Handles both Clark notation (`{ns}local`, emitted when the namespace is
    properly declared) AND literal `prefix:local` strings that lxml's
    recover-mode surfaces when the namespace was NOT declared (the real
    xi:include failure mode we hit on dogfood).
    """
    if not isinstance(tag, str):
        return ""
    if "}" in tag:
        return tag.split("}", 1)[1]
    if ":" in tag:
        return tag.split(":", 1)[1]
    return tag
