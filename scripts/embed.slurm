#!/bin/bash -l
#SBATCH --job-name=parliament_embed
#SBATCH --time=12:00:00
#SBATCH --ntasks=1
#SBATCH --gres=gpu:a40:1
#SBATCH --nodes=1

set -euo pipefail

REPO_ROOT="${REPO_ROOT:?Submit with scripts/submit_embeddings.sh}"
VENV_PATH="${VENV_PATH:-$REPO_ROOT/.venv}"
INPUT_PATH="${INPUT_PATH:?Prepared JSONL input is required}"
OUTPUT_PATH="${OUTPUT_PATH:?Embedding output directory is required}"
export no_proxy=127.0.0.1,localhost,::1
export NO_PROXY="$no_proxy"
export HPCVAULT="${HPCVAULT:-/home/vault/v123be/v123be23}"
export TORCH_HOME="$HPCVAULT/.cache/torch"
export HF_HOME="$HPCVAULT/.cache/huggingface"
export XDG_CACHE_HOME="$HPCVAULT/.cache"
export XDG_CONFIG_HOME="$HPCVAULT/.config"
export PYTHONUNBUFFERED=1
export TOKENIZERS_PARALLELISM=false
export PYTORCH_CUDA_ALLOC_CONF="${PYTORCH_CUDA_ALLOC_CONF:-expandable_segments:True}"

module purge
module load python/3.12-base
if [[ ! -f "$VENV_PATH/bin/activate" ]]; then
    echo "Virtual environment not found: $VENV_PATH" >&2
    exit 1
fi
source "$VENV_PATH/bin/activate"
export http_proxy="${http_proxy:-http://proxy:80}"
export https_proxy="${https_proxy:-http://proxy:80}"
if [[ -z "${HF_TOKEN:-}" && -n "${HF_TOKEN_FILE:-}" && -f "$HF_TOKEN_FILE" ]]; then
    export HF_TOKEN="$(<"$HF_TOKEN_FILE")"
fi
export TMPDIR="/tmp/${USER}_${SLURM_JOB_ID}_${SLURM_ARRAY_TASK_ID:-0}"
mkdir -p "$TMPDIR" "$OUTPUT_PATH"
cd "$REPO_ROOT"
SHARD="${SLURM_ARRAY_TASK_ID:-0}"
SHARDS="${EMBED_SHARDS:-1}"
REVISION_ARGS=()
if [[ -n "${EMBED_REVISION:-}" ]]; then
    REVISION_ARGS=(--revision "$EMBED_REVISION")
fi
python -m parliament embed \
    --input "$INPUT_PATH" \
    --output "$OUTPUT_PATH/shard-$SHARD" \
    --device cuda --batch-size "${EMBED_BATCH_SIZE:-64}" \
    --shard "$SHARD" --shards "$SHARDS" "${REVISION_ARGS[@]}"
