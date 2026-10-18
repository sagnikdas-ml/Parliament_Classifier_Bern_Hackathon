import hashlib
import json
import os
import threading
import time
import resource
import sys
from pathlib import Path

import numpy as np
import pyarrow as pa
import pyarrow.parquet as pq

from parliament import db
from parliament.config import DATA, EMBED_VERSION, MODEL, digest, json_text
from parliament.ingest import upsert

MODEL_LOCK = threading.RLock()
MODELS = {}


def file_hash(path):
    checksum = hashlib.sha256()
    with Path(path).open("rb") as source:
        while block := source.read(1024 * 1024):
            checksum.update(block)
    return checksum.hexdigest()


def load_model(revision=None, device="auto"):
    os.environ.setdefault("HF_HOME", str(DATA / "cache" / "huggingface"))
    os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
    import torch
    from huggingface_hub import HfApi
    from sentence_transformers import SentenceTransformer

    with MODEL_LOCK:
        if device == "auto":
            device = "cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu"
        if not revision:
            pinned = DATA / "embedding-revision.json"
            if pinned.exists():
                revision = json.loads(pinned.read_text())["revision"]
            else:
                revision = HfApi().model_info(MODEL).sha
                pinned.parent.mkdir(parents=True, exist_ok=True)
                pinned.write_text(json_text({"model": MODEL, "revision": revision}))
        key = (revision, device)
        if key not in MODELS:
            MODELS[key] = SentenceTransformer(MODEL, revision=revision, device=device)
            MODELS[key].max_seq_length = 512
        return MODELS[key], revision, device


def encode(model, texts, batch_size=8):
    import torch
    with MODEL_LOCK:
        try:
            return model.encode(texts, batch_size=batch_size, normalize_embeddings=True, convert_to_numpy=True, show_progress_bar=False)
        except RuntimeError as error:
            if str(model.device).startswith("mps"):
                model.to("cpu")
                torch.mps.empty_cache()
                return model.encode(texts, batch_size=max(1, batch_size // 2), normalize_embeddings=True, convert_to_numpy=True, show_progress_bar=False)
            raise error


def export_units(destination, sample=None, titles_only=False):
    destination = Path(destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    conditions = ["length(text)>0"]
    parameters = []
    if titles_only:
        conditions.append("kind='title'")
    if sample is not None:
        conditions.append("affair_id IN (SELECT unnest(?::BIGINT[]))")
        parameters.append([item["affair_id"] for item in sample])
    last_id = ""
    count = 0
    temporary = destination.with_suffix(".part")
    with temporary.open("w", encoding="utf-8") as output:
        while True:
            records = db.query(f"SELECT * EXCLUDE(fetched_at) FROM units WHERE {' AND '.join(conditions)} AND id>? ORDER BY id LIMIT 1000", [*parameters, last_id])
            if not records:
                break
            for record in records:
                output.write(json_text(record) + "\n")
            last_id = records[-1]["id"]
            count += len(records)
    temporary.replace(destination)
    return {"units": count, "path": str(destination), "sha256": file_hash(destination)}


def passages(model, record):
    text = record["text"]
    offsets = model.tokenizer(text, add_special_tokens=False, return_offsets_mapping=True, truncation=False)["offset_mapping"]
    for start in range(0, len(offsets), 416):
        window = offsets[start:start + 480]
        if not window:
            break
        passage = text[window[0][0]:window[-1][1]]
        if passage.strip():
            yield {"id": digest([record["id"], record["content_hash"], start]),
                   "unit_id": record["id"], "content_hash": record["content_hash"], "passage": passage}
        if start + 480 >= len(offsets):
            break


def embed_file(source, destination, batch_size=8, device="auto", shard=0, shards=1, revision=None):
    started = time.monotonic()
    if batch_size < 1 or shards < 1 or not 0 <= shard < shards:
        raise ValueError("Invalid batch size or shard parameters")
    source, destination = Path(source), Path(destination)
    destination.mkdir(parents=True, exist_ok=True)
    manifest_path = destination / "manifest.json"
    previous = json.loads(manifest_path.read_text()) if manifest_path.exists() else None
    if previous:
        revision = revision or previous["revision"]
    model, revision, selected_device = load_model(revision, device)
    pipeline = digest([MODEL, revision, EMBED_VERSION])
    manifest = {"model": MODEL, "revision": revision, "preprocessing": EMBED_VERSION,
                "pipeline": pipeline, "dimension": 384, "input_sha256": file_hash(source),
                "shard": shard, "shards": shards}
    if previous and previous != manifest:
        raise ValueError("Output directory belongs to different input/model/shard; choose a new directory")
    manifest_path.write_text(json_text(manifest))
    pending = []
    chunk = 0
    total = 0

    def flush(records, number):
        target = destination / f"part-{number:07d}.parquet"
        if target.exists():
            existing = pq.read_table(target, columns=["id"])["id"].to_pylist()
            if existing != [record["id"] for record in records]:
                raise ValueError("Checkpoint does not match source passages")
            return
        vectors = encode(model, ["passage: " + record["passage"] for record in records], batch_size)
        values = [{**record, "pipeline": pipeline, "model": MODEL, "revision": revision, "vector": vector.astype(np.float32).tolist()} for record, vector in zip(records, vectors)]
        temporary = target.with_suffix(".part")
        pq.write_table(pa.Table.from_pylist(values), temporary, compression="zstd")
        temporary.replace(target)
        print(f"Embedded chunk {number}: {len(values)} passages ({selected_device})", flush=True)

    with source.open(encoding="utf-8") as input_file:
        for index, line in enumerate(input_file):
            if index % shards != shard:
                continue
            record = json.loads(line)
            if digest(record["text"]) != record["content_hash"]:
                raise ValueError("Input text hash mismatch")
            for passage in passages(model, record):
                pending.append(passage)
                total += 1
                if len(pending) == 256:
                    flush(pending, chunk)
                    pending = []
                    chunk += 1
    if pending:
        flush(pending, chunk)
        chunk += 1
    result = {"passages": total, "chunks": chunk, "pipeline": pipeline, "device": str(model.device) if hasattr(model, "device") else selected_device,
              "elapsed_seconds": round(time.monotonic() - started, 3),
              "peak_process_rss_mb": round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / (1024 * 1024 if sys.platform == "darwin" else 1024), 1)}
    (destination / "complete.json").write_text(json_text(result))
    return result


def import_embeddings(directory):
    directory = Path(directory)
    manifest = json.loads((directory / "manifest.json").read_text())
    if manifest["model"] != MODEL or manifest["preprocessing"] != EMBED_VERSION or manifest["dimension"] != 384:
        raise ValueError("Unsupported embedding model or preprocessing")
    if manifest["pipeline"] != digest([MODEL, manifest["revision"], EMBED_VERSION]):
        raise ValueError("Invalid embedding pipeline fingerprint")
    count = 0
    for path in sorted(directory.glob("part-*.parquet")):
        records = pq.read_table(path).to_pylist()
        for record in records:
            vector = np.asarray(record["vector"], dtype=np.float32)
            if vector.shape != (384,) or not np.isfinite(vector).all() or not np.isclose(np.linalg.norm(vector), 1, atol=0.01):
                raise ValueError(f"Invalid vector in {path.name}")
            if any(record[key] != manifest[key] for key in ("pipeline", "model", "revision")):
                raise ValueError("Mixed embedding versions")
        with db.connect() as connection:
            active = db.rows(connection, "SELECT value FROM settings WHERE key='embedding_manifest'")
            if active and json.loads(active[0]["value"])["pipeline"] != manifest["pipeline"]:
                raise ValueError("Database contains a different embedding pipeline")
            connection.execute("INSERT OR REPLACE INTO settings VALUES ('embedding_manifest', ?)", [json_text(manifest)])
            upsert(connection, "embeddings", records)
        count += len(records)
    return {"imported_passages": count}


def query_vector(text):
    active = db.query("SELECT value FROM settings WHERE key='embedding_manifest'")
    if not active:
        return None, None
    manifest = json.loads(active[0]["value"])
    model, _, _ = load_model(manifest["revision"])
    vector = encode(model, ["query: " + text])[0].astype(np.float32).tolist()
    return vector, manifest["pipeline"]
