#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
export REPO_ROOT="${REPO_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
export INPUT_PATH="${INPUT_PATH:-$REPO_ROOT/data/prepared/units.jsonl}"
export OUTPUT_PATH="${OUTPUT_PATH:-$REPO_ROOT/data/embeddings/full}"
export EMBED_SHARDS="${EMBED_SHARDS:-1}"
export EMBED_REVISION="${EMBED_REVISION:-}"
if [[ ! "$EMBED_SHARDS" =~ ^[1-9][0-9]*$ ]]; then
    echo "EMBED_SHARDS must be a positive integer" >&2
    exit 1
fi
if [[ ! -f "$INPUT_PATH" ]]; then
    echo "Missing prepared input: $INPUT_PATH" >&2
    exit 1
fi
if [[ -z "$EMBED_REVISION" ]]; then
    REVISION_FILE="$REPO_ROOT/data/embedding-revision.json"
    if [[ ! -f "$REVISION_FILE" ]]; then
        echo "Set EMBED_REVISION to the model commit from the local embedding manifest." >&2
        exit 1
    fi
    EMBED_REVISION="$("${VENV_PATH:-$REPO_ROOT/.venv}/bin/python" -c 'import json,sys; print(json.load(open(sys.argv[1]))["revision"])' "$REVISION_FILE")"
    export EMBED_REVISION
fi
mkdir -p "$REPO_ROOT/logs" "$OUTPUT_PATH"
sbatch --export=ALL --array="0-$((EMBED_SHARDS - 1))" \
    --output="$REPO_ROOT/logs/embeddings_%A_%a.out" \
    "$@" "$SCRIPT_DIR/embed.slurm"
