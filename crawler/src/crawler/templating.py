"""Templating-manifest detection (C.5).

Narrow scope:
  - Scan for files named `templating_config.yaml`
  - Each manifest's top-level `outputs:` list names files that should be
    flagged `generated=True` + `generated_from=<manifest path>`.
  - No inference, no glob resolution, no Jinja2 introspection. A file is
    flagged ONLY when explicitly listed.
  - When no manifest exists, `mark_generated_from_manifests()` is a no-op.
"""
from __future__ import annotations

from pathlib import Path

from .graph import FileNode

MANIFEST_NAME = "templating_config.yaml"


def mark_generated_from_manifests(
    files: list[FileNode], root: Path,
) -> None:
    """Mutate FileNodes in-place; set generated=True for every file whose
    POSIX path matches an explicit listing in a detected manifest.
    """
    manifest_files = [f for f in files if f.name == MANIFEST_NAME]
    if not manifest_files:
        return

    files_by_path: dict[str, FileNode] = {f.path: f for f in files}

    for manifest in manifest_files:
        manifest_abs = root / manifest.path
        try:
            outputs = _parse_outputs(manifest_abs)
        except Exception:
            # Malformed manifest — skip, do not fail the crawl.
            continue
        manifest_dir = manifest.folder  # POSIX relative dir of manifest
        for out in outputs:
            # Resolve output relative to manifest's folder.
            target_path = (
                f"{manifest_dir}/{out}" if manifest_dir else out
            )
            target_path = target_path.replace("\\", "/")
            target = files_by_path.get(target_path)
            if target is None:
                # Manifest lists a file that wasn't discovered — no-op.
                continue
            target.generated = True
            target.generated_from = manifest.path


def _parse_outputs(manifest_path: Path) -> list[str]:
    """Parse a templating_config.yaml and return its `outputs:` list.

    Minimal YAML subset — uses ruamel.yaml (already a crawler dep via the
    yaml parser). Returns [] when `outputs` is absent or not a list.
    """
    from ruamel.yaml import YAML  # local import — ruamel is heavy

    y = YAML(typ="safe")
    with open(manifest_path, "rb") as fh:
        data = y.load(fh)
    if not isinstance(data, dict):
        return []
    outputs = data.get("outputs")
    if not isinstance(outputs, list):
        return []
    return [str(x) for x in outputs if isinstance(x, (str, bytes))]
