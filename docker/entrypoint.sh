#!/usr/bin/env bash
set -euo pipefail

echo "viva: crawling /target ..."
python -m crawler /target --out /app/viewer/dist/graph.json --no-timestamp -v "$@"
echo "viva: visualizing /target -> http://localhost:5173"
exec python -m http.server 5173 --bind 0.0.0.0 --directory /app/viewer/dist
