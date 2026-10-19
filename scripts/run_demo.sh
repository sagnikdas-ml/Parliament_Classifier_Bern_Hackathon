#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
PYTHON="${PYTHON:-$ROOT/.venv/bin/python}"
if [[ ! -x "$PYTHON" ]]; then
    echo "Create .venv and install requirements-embeddings.txt first. See README.md."
    exit 1
fi
exec "$PYTHON" -m uvicorn api:app --host 127.0.0.1 --port "${PORT:-8000}" --workers 1 --no-access-log
