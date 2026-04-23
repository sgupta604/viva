"""Build ClusterNode[] from a list of FileNodes.

Pure functions — no I/O, no filesystem access. Consumes the discovery+parse
output. Called from `crawl()` after `resolve_references()` so the d-aggregate
synthetic edges land in the Graph.

Rules (GRAPH-SCHEMA.md v2 + research Q13):
  1. A ClusterNode is emitted for each distinct folder that contains at least
     one file in the graph.
  2. A cluster's `childFiles` = file ids directly in it (not recursive).
  3. A cluster's `childClusters` = child-folder paths (not recursive children).
  4. `.d/` detection: a folder whose POSIX basename ends with `.d`
     AND whose parent folder contains a sibling file with the SAME stem
     (e.g. `foo.d/` alongside `foo.xml`) is marked `kind="d-aggregate"`.
  5. All other folders (including `.d/` without a sibling stem) are
     `kind="folder"`.
  6. The sibling file (`foo.xml` for `foo.d/`) sits in its own parent cluster,
     NOT moved into the aggregate — keeping the tree shape intact. The
     d-aggregate EDGES (added by refs.py) link the sibling to each child in
     numeric-prefix order.
"""
from __future__ import annotations

import re

from .graph import ClusterNode, Edge, FileNode

# Numeric-prefix detection: "01-alpha.xml" -> order=1, basename=alpha.xml
_ORDER_RE = re.compile(r"^(\d+)[-_]")


def build_clusters(files: list[FileNode]) -> list[ClusterNode]:
    """Walk the file-path tree and emit one ClusterNode per folder.

    Deterministic output: clusters sorted by path at the end.
    """
    # For each file, collect its folder path and every ancestor folder.
    folder_files: dict[str, list[str]] = {}  # folder -> [file_id, ...]
    folders: set[str] = set()
    for f in files:
        folder = f.folder
        folder_files.setdefault(folder, []).append(f.id)
        # Every ancestor is also a folder we emit a cluster for.
        cur = folder
        while cur:
            folders.add(cur)
            # Parent
            if "/" not in cur:
                break
            cur = cur.rsplit("/", 1)[0]
        # Top-level file (folder == "") — don't add empty string.
    # Filter out empty folder ("") — used by files at crawl root. No cluster
    # for the root; its files roll up to parent=None top-level clusters.
    folders.discard("")

    # Child-cluster relationships: cluster X has Y as child iff Y's parent == X.
    children_of: dict[str, list[str]] = {}
    for folder in folders:
        parent = folder.rsplit("/", 1)[0] if "/" in folder else None
        if parent is not None and parent in folders:
            children_of.setdefault(parent, []).append(folder)

    # .d/ detection: for each folder whose basename endswith .d, check for a
    # sibling file of matching stem in its parent folder.
    files_by_folder: dict[str, list[FileNode]] = {}
    for f in files:
        files_by_folder.setdefault(f.folder, []).append(f)

    d_aggregates: set[str] = set()
    for folder in folders:
        basename = folder.rsplit("/", 1)[-1] if "/" in folder else folder
        if not basename.endswith(".d"):
            continue
        stem = basename[:-2]
        # Parent folder
        parent = folder.rsplit("/", 1)[0] if "/" in folder else ""
        siblings = files_by_folder.get(parent, [])
        # A sibling file with matching stem: `stem.xml`, `stem.yaml`, etc.
        stem_match = any(
            f.name.rsplit(".", 1)[0] == stem
            for f in siblings
        )
        if stem_match:
            d_aggregates.add(folder)

    out: list[ClusterNode] = []
    for folder in sorted(folders):
        parent_path = folder.rsplit("/", 1)[0] if "/" in folder else None
        parent = parent_path if (parent_path and parent_path in folders) else None
        kind = "d-aggregate" if folder in d_aggregates else "folder"
        out.append(
            ClusterNode(
                path=folder,
                parent=parent,
                child_files=sorted(folder_files.get(folder, [])),
                child_clusters=sorted(children_of.get(folder, [])),
                kind=kind,
            )
        )
    return out


def build_d_aggregate_edges(
    files: list[FileNode],
    clusters: list[ClusterNode],
) -> list[Edge]:
    """Synthesize edges from each `.d/` sibling file to every child of the
    `.d/` directory, carrying numeric-prefix load order.

    `foo.d/01-alpha.xml` → attrs.order=1 ; `foo.d/02-beta.xml` → attrs.order=2.
    Files without a numeric prefix get `attrs.order = <position in sorted list>`.
    """
    edges: list[Edge] = []
    files_by_folder: dict[str, list[FileNode]] = {}
    for f in files:
        files_by_folder.setdefault(f.folder, []).append(f)

    for cluster in clusters:
        if cluster.kind != "d-aggregate":
            continue
        basename = cluster.path.rsplit("/", 1)[-1] if "/" in cluster.path else cluster.path
        stem = basename[:-2]  # strip trailing .d
        parent = cluster.path.rsplit("/", 1)[0] if "/" in cluster.path else ""
        siblings = files_by_folder.get(parent, [])
        parent_file = next(
            (f for f in siblings if f.name.rsplit(".", 1)[0] == stem),
            None,
        )
        if parent_file is None:
            continue
        # Children — the files DIRECTLY in the .d/ cluster.
        children = sorted(
            files_by_folder.get(cluster.path, []),
            key=lambda f: f.name,
        )
        for idx, child in enumerate(children, start=1):
            m = _ORDER_RE.match(child.name)
            order = int(m.group(1)) if m else idx
            edges.append(
                Edge(
                    source=parent_file.id,
                    target=child.id,
                    kind="d-aggregate",
                    unresolved=None,
                    attrs={"order": order},
                )
            )
    return edges
