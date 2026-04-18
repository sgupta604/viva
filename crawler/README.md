# viva-crawler

Python crawler that walks a config-heavy codebase and emits a deterministic
`graph.json` consumed by the viewer.

## Install

```bash
cd crawler
pip install -e .[dev]
```

## Run

```bash
python -m crawler <path-to-target> --out ../viewer/public/graph.json --no-timestamp
```

Flags:

- `--out PATH` — output path (default `./graph.json`)
- `--include GLOB` — repeatable include filter
- `--exclude GLOB` — repeatable exclude filter
- `--no-timestamp` — suppress `generatedAt` for deterministic output
- `--emit-sources` — mirror source files into `<out-dir>/source/<path>` for the viewer's raw tab

## Test

```bash
pytest -v
pytest -v -m integration
ruff check .
```

## Contract

The emitted `graph.json` shape is locked by `../docs/GRAPH-SCHEMA.md`.
