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

v2 additions (large-codebase-viewer):
- Extracts xsi:schemaLocation (namespace/location pairs, whitespace-split) and
  xsi:noNamespaceSchemaLocation as `kind="xsd"` raw refs. XSD files (suffix
  `.xsd`) are skipped as sources — a schema doesn't reference another.
- Detects xi:include siblings with xi:fallback and tags the raw ref
  `flags=(("has_fallback", True),)` so refs.py can prefix the unresolved
  entry with `fallback:`.
- Scans declared logical IDs (`id`, `model-id`, `scheme`, `name`) on a
  whitelist of declarer tags (param/entry/item/catalogue/scheme) and records
  them via the FileNode's `logical_id_declarations` sidecar set. References
  to logical IDs land as `kind="logical-id"` raw refs; resolution + cardinality
  cap is centralized in refs.py.
"""
from __future__ import annotations

from pathlib import Path

from lxml import etree

from ..graph import FileNode, ParamNode, RawRef

# --- v2 config --------------------------------------------------------------

# Declarer tags for logical-ID scanning. When an element has one of these tags
# and declares `id`/`model-id`/`scheme`/`name`, the attr value is registered as
# a declared logical ID for cross-file linking via refs.py.
_LOGICAL_ID_DECLARER_TAGS = frozenset({
    "param",
    "entry",
    "item",
    "catalogue",
    "scheme",
})
_LOGICAL_ID_ATTRS = ("id", "model-id", "scheme", "name")

# xsi namespace URI — matched in Clark notation on attr keys.
_XSI_NS = "http://www.w3.org/2001/XMLSchema-instance"

# xinclude namespace — xi:fallback detection uses Clark form when lxml honored
# the namespace and literal-prefix form when it didn't (recover mode).
_XINCLUDE_NS = "http://www.w3.org/2001/XInclude"


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
        _collect_xsd_refs(tree, node, abs_path)

    return node


def _collect_xsd_refs(elem: etree._Element, node: FileNode, abs_path: Path) -> None:
    """Scan every element for `xsi:schemaLocation` + `xsi:noNamespaceSchemaLocation`.

    - `schemaLocation` is whitespace-separated namespace/location pairs; emit
      one raw ref per location.
    - `noNamespaceSchemaLocation` is a single location.
    - Skip emission entirely if the source file itself is an .xsd schema —
      a schema doesn't reference its own validator.
    """
    if abs_path.suffix.lower() == ".xsd":
        return
    schema_location_key = f"{{{_XSI_NS}}}schemaLocation"
    no_ns_key = f"{{{_XSI_NS}}}noNamespaceSchemaLocation"
    # Walk every elem — XML allows xsi:* on any element, not just root.
    for e in elem.iter():
        if not hasattr(e, "attrib"):
            continue
        attrib = e.attrib
        sl = attrib.get(schema_location_key)
        # recover-mode fallback: some docs arrive with literal "xsi:schemaLocation"
        # as a key (no Clark notation) because the xsi prefix was never declared.
        if sl is None:
            sl = attrib.get("xsi:schemaLocation")
        if sl:
            # Pairs are whitespace-separated: "ns1 loc1 ns2 loc2 ...".
            parts = sl.split()
            # Emit each even-indexed location.
            for i in range(1, len(parts), 2):
                node.raw_refs.append(RawRef(kind="xsd", raw=parts[i]))
        nns = attrib.get(no_ns_key)
        if nns is None:
            nns = attrib.get("xsi:noNamespaceSchemaLocation")
        if nns:
            node.raw_refs.append(RawRef(kind="xsd", raw=nns))


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
            # v2: detect xi:fallback sibling inside the include element so
            # refs.py can classify dangling hrefs with a fallback: prefix.
            has_fallback = _has_xi_fallback(elem)
            flags = (("has_fallback", True),) if has_fallback else None
            node.raw_refs.append(RawRef(kind="include", raw=target, flags=flags))
    elif tag == "ref":
        target = elem.get("id") or elem.get("path")
        if target:
            node.raw_refs.append(RawRef(kind="ref", raw=target))
    elif tag == "import":
        target = elem.get("path") or elem.get("file")
        if target:
            node.raw_refs.append(RawRef(kind="import", raw=target))

    # v2 — logical-ID declaration + reference extraction.
    # Declared: on a whitelisted tag, any of id/model-id/scheme/name attrs
    # registers the value as a declared ID. Stored on the sidecar set
    # (FileNode.logical_id_declarations).
    if tag in _LOGICAL_ID_DECLARER_TAGS:
        for attr_name in _LOGICAL_ID_ATTRS:
            v = elem.get(attr_name)
            if v:
                node.logical_id_declarations.add(v.strip())
    # Referenced: model-id and scheme attrs on ANY tag (not just declarers)
    # are treated as references to another file's declared ID. `id` on a
    # non-declarer tag is ambiguous (often inline IDs) and is NOT emitted —
    # avoids the noise surfaced in Risk #3.
    for attr_name in ("model-id", "scheme"):
        if tag in _LOGICAL_ID_DECLARER_TAGS:
            # On a declarer element this is a SELF declaration, not a ref.
            continue
        v = elem.get(attr_name)
        if v:
            node.raw_refs.append(RawRef(kind="logical-id", raw=v.strip()))

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


def _has_xi_fallback(include_elem: etree._Element) -> bool:
    """Return True when the xi:include element contains an xi:fallback child.

    Recovers both Clark-notation tags (namespace was declared) and literal
    `xi:fallback` tags (recover mode on undeclared namespaces).
    """
    fallback_clark = f"{{{_XINCLUDE_NS}}}fallback"
    for child in include_elem:
        tag = child.tag
        if not isinstance(tag, str):
            continue
        if tag == fallback_clark or tag.endswith(":fallback") or tag == "fallback":
            return True
    return False


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
