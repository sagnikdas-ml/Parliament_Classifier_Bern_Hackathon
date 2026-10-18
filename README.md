# Swiss Parliamentary Topic Classifier

## Journalist demo: Parliament Desk

The homepage is a single-screen research workflow: enter a natural-language question
and dates, retrieve up to ten candidates, then automatically classify them against
the interpreted topic and translate titles and accepted evidence into English.
Originals remain visible. Results are paginated to fit the viewport; no landing page
or full-page scrolling is required. Classification and translation failures can be
retried individually. Stop prevents subsequent rows from starting.

Dates may be written in the question or supplied in the date fields (fields take
precedence). The displayed interpretation lets users check the scope and interval.
Dates refer to affair `begin_date`, inclusive—not adoption or last-update dates.
Each search performs bounded live API metadata discovery (three queries, up to 100
records and a 15-second timeout each) and merges date-filtered records into the local catalogue. It is not
an exhaustive sync. Missing source content is fetched for selected candidates;
previously fetched text remains cached unless explicitly refreshed.

The separate digitalisation benchmark is available through **Evaluation**. It does
not measure arbitrary query interpretation or translation quality. See
`evaluation/BENCHMARK.md`; reproduce with `python -m parliament.digital_benchmark run`.

Start the prepared local collection with `bash scripts/run_demo.sh` and open
http://127.0.0.1:8000. The new home page supports reporting scopes, candidate
discovery, source inspection, human corrections, and Markdown evidence shortlists.
The original classification/evaluation dashboard remains at `/admin`.

**Quality warning:** the existing 8B APS classifier failed a small seven-case
AI-assisted reference check. Use this as a human-review prototype, not unattended
editorial classification; see `VALIDATION.md`. Exact quotations prove traceability,
not correctness. Run `python -m parliament.research_evaluation` to reproduce the check
against the locally cached sources and predictions.

See [PRODUCT.md](PRODUCT.md) for the journalist story and five-minute demonstration,
and [web/README.md](web/README.md) for the optional local Cloudflare Worker gateway
and later authenticated deployment. The shortlist is session-only; export before
refreshing. No confidential notes or automatically written news articles are stored.

A local FastAPI application using OpenParlData, DuckDB, multilingual E5 embeddings,
and the Apertus API. It supports APS chapter/topic classification, approved custom
topic definitions, candidate retrieval, evidence inspection, human review, and
capped resumable classification jobs.

## Run locally

Python 3.12+ is recommended. The implementation also runs in this repository's
existing Python 3.14 virtual environment. Run commands from the repository root.

### Quick start

1. **Install** (once):

   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   python -m pip install -r requirements-embeddings.txt
   ```

2. **Provide the Apertus (Keera) API key** with either method; keep it private:

   ```bash
   export KEERA_API_KEY="your-team-key"   # or put the key in a file named .key
   ```

3. **Import the data** (once; reuses existing downloads and is safe to repeat):

   ```bash
   python -m parliament bootstrap
   ```

4. **Start the server**:

   ```bash
   bash scripts/run_demo.sh
   ```

   This runs `uvicorn api:app` on 127.0.0.1 with one worker. Set `PORT=8001` to use
   another port. If you see `address already in use`, a server is already running
   on that port: stop it (`lsof -nP -iTCP:8000 -sTCP:LISTEN`, then `kill <PID>`) so
   it picks up code changes, or choose another `PORT`. The equivalent manual
   command is `uvicorn api:app --host 127.0.0.1 --port 8000 --workers 1`.

5. **Open it**:

   | URL | Page |
   |---|---|
   | <http://127.0.0.1:8000/> | Parliament Desk (journalist workflow) |
   | <http://127.0.0.1:8000/admin> | Classification and evaluation dashboard |
   | <http://127.0.0.1:8000/docs> | API specification |
   | <http://127.0.0.1:8000/chat-ui> | Original chat interface |

Without a key the app still starts and searches the local collection, but
classification, translation and query interpretation need the Apertus API.
Semantic search needs imported embeddings (see below); otherwise only keyword
search is used. Bind to localhost: this prototype has no user authentication.
To require a bearer token on every request, set `PARL_BACKEND_TOKEN` before
starting; callers must then send `Authorization: Bearer <token>`.

### Run the tests

```bash
python -m unittest discover -s tests       # Python tests
cd web && npm install && npm test          # Cloudflare Worker gateway tests
```

`bootstrap` downloads **all affair metadata**, bodies, the 165-topic APS workbook,
and the challenge's source labels. It does not download every document. Existing
files are reused; `--refresh` explicitly refreshes exports. Importing again is safe.
Downloads use temporary files, validators for resumption where supported, gzip
integrity checks, and SHA-256 receipts. If a download fails, rerun the same command.

Configuration:

| Variable | Default |
|---|---|
| `PARL_DATA_DIR` | `data/` beside this repository |
| `KEERA_API_KEY` | fallback to `.key` |
| `APERTUS_BASE_URL` | `https://gateway.keera.ch/api/v1` |
| `APERTUS_MODEL` | `apertus-v1-5-8b` |
| `HF_HOME` | `data/cache/huggingface` unless already set |

Use one API worker. A file lock serializes short DuckDB transactions across CLI
and web processes; inference runs outside the database lock. A separate worker
lease prevents simultaneous background classification workers. Do not share a live
DuckDB file over a network filesystem or between HPC nodes.

## Local evaluation and embeddings

```bash
python -m parliament fetch --sample 200
python -m parliament export-units --sample 200 --output data/prepared/sample.jsonl
python -m parliament embed --input data/prepared/sample.jsonl --output data/embeddings/sample
python -m parliament import-embeddings data/embeddings/sample
python -m parliament classify 70435 --language de
python -m parliament batch --limit 200
python -m parliament evaluate --output data/evaluation/report.json
python -m parliament benchmark
```

The reproducible sample balances available language/level combinations using
deterministic hashes; it is not representative of corpus prevalence. Its IDs and
selected languages are saved under `data/evaluation/`. The sample is an evaluation
cohort, not a training set. The application never uses reviewed labels as prompt
examples. Freeze 30–50 reviewed affairs in the UI before reporting APS accuracy.
Frozen reviews retain the prediction snapshot they assessed and cannot be edited.
Displayed predictions can influence reviewers, so this is assisted review rather
than a blind benchmark. No APS-labelled gold standard is supplied upstream.

The first embedding run downloads `intfloat/multilingual-e5-small`, pins its model
commit, and uses MPS on Apple Silicon, CUDA on NVIDIA, or CPU otherwise. MPS runtime
errors fall back to CPU. Batches default to 8. Documents are split by tokenizer
offsets into 480-token passages with 64-token overlap; text is not silently truncated
to one embedding. Prefixes are `query:` and `passage:`, with normalized 384-element
vectors. The same model commit and preprocessing are required everywhere.

Embedding chunks are atomic Parquet files. Repeating a command resumes by checking
stable passage IDs. Changed input requires a new output directory. Imports reject
incompatible or invalid vectors; outdated vectors are excluded from retrieval by
content hash. Imports are idempotent. Copy an entire output directory, including
`manifest.json`, when moving results between machines.

## Full corpus and FAU HPC

Preparation and GPU processing are separate:

```bash
python -m parliament bootstrap
python -m parliament bulk-texts
python -m parliament export-units --output data/prepared/units.jsonl
```

For a quicker title-only corpus, omit `bulk-texts` and add `--titles-only` to
`export-units`. The much larger attached-document download is an explicit opt-in:
`python -m parliament bulk-texts --documents`. Extracted text already supplied by
OpenParlData is used; there is no OCR or PDF scraping in this version.

Copy the repository, prepared JSONL, and `data/embedding-revision.json` to FAU.
Create a Linux virtualenv there; **do not copy the macOS virtualenv**. Install
`requirements-embeddings.txt` in that environment using the site's Python module.

```bash
export REPO_ROOT=/home/hpc/v123be/v123be23/Parliament_Classifier_Bern_Hackathon
export VENV_PATH="$REPO_ROOT/.venv"
export INPUT_PATH="$REPO_ROOT/data/prepared/units.jsonl"
export OUTPUT_PATH="$REPO_ROOT/data/embeddings/full"
export HPCVAULT=/home/vault/v123be/v123be23
bash scripts/submit_embeddings.sh
```

The supplied FAU template requests one A40 for 12 hours, loads
`python/3.12-base`, uses the site proxy, and places caches in the vault. Log
directories are created before submission. Override Slurm options by passing them
to the wrapper, for example `bash scripts/submit_embeddings.sh --time=06:00:00`.
The public model does not require an HF token, but `HF_TOKEN` or `HF_TOKEN_FILE`
can be supplied. `EMBED_REVISION` may explicitly supply the pinned model commit.

For multiple independent jobs, set `EMBED_SHARDS=4`; array jobs partition input
records deterministically and write separate directories. Each needs one GPU.
Keep the shard count unchanged when resuming. `EMBED_BATCH_SIZE` defaults to 64 on
HPC. Model weights should be cached before allocating large GPU jobs when possible.

Copy results back, then import each shard:

```bash
for directory in data/embeddings/full/shard-*; do
  python -m parliament import-embeddings "$directory"
done
```

The equivalent local full-corpus command is:

```bash
python -m parliament embed --input data/prepared/units.jsonl --output data/embeddings/full-local --batch-size 8
```

HPC runs embeddings only. Classification remains on the Apertus API. The Slurm
scripts are provided for submission on FAU; they cannot be cluster-tested locally.

## Matching and classification

1. Approve a custom definition and multilingual keywords, or use the APS catalogue.
2. Combine keyword occurrence ranking with cosine similarity using reciprocal-rank
   fusion. Exact vector scoring runs in DuckDB with a 1 GB query memory limit.
3. Fetch candidate content and classify its substantive policy subject with Apertus.
4. Validate topic IDs and exact evidence quotations before storing labels.

Keyword matching is a simple baseline, not BM25. It works immediately across the
imported metadata. Semantic search covers only embedded affairs. The UI reports
coverage; a candidate ranking is not a verified classification. Similarity is not
a calibrated probability. Full-corpus approximate indexing is deferred until exact
retrieval has been benchmarked at the intended vector volume.

All 165 APS topics are supplied to the classifier. Existing Curia Vista and cantonal
labels are stored separately and never presented as APS ground truth. Associated
documents are fetched if ordinary texts do not provide substantive content.
Missing content produces an abstention, not a negative label. Each affair is limited
to three 12,000-character content chunks per classification; longer sources are
marked partial and cannot yield a definitive negative. Verified quotations support
auditability but do not prove the semantic assignment is correct.

The gateway must support JSON-schema constrained response mode. Structured-output validation
allows one repair attempt. HTTP errors have bounded retries. The model version,
prompt version, source hash, language, and definition version participate in the
cache key. Definitions can be revised; old results remain as historical snapshots.

Background jobs have explicit affair caps (maximum 10,000 per job), one inference
at a time, progress, cancellation, errors, and resumption. Cancelling takes effect
after the in-flight affair finishes. A changed definition requires a new job.
Continue large scans by setting the next starting affair ID; a cap is not a dollar
budget because content length and retries vary. Interrupted CLI batches resume with
`python -m parliament batch --resume JOB_ID`. Resume paused server jobs in the UI.

## API examples

```bash
curl http://127.0.0.1:8000/api/status
curl -X POST http://127.0.0.1:8000/api/affairs/70435/classify \
  -H 'Content-Type: application/json' -d '{"topic_id":"aps","language":"de"}'
python -m parliament search 'digital public services' --limit 30
python -m parliament search 'Digitalisierung numérisation digitalizzazione' --digitalisation-eval
```

The digitalisation check reports recall against known PolitMonitor positives.
Unlisted affairs are unlabelled, not verified negatives; precision requires manual
review. APS metrics use frozen review snapshots, report micro/macro F1 and exact
match, and break results down by language. Romansh quality remains unverified.
No model-generated confidence or unreviewed accuracy claim is reported.

## Validation

```bash
python -m unittest discover -s tests -v
python -m compileall -q parliament api.py
bash -n scripts/embed.slurm scripts/submit_embeddings.sh
```

Tests use isolated temporary databases and mocked inference; they do not spend API
credits or download models. Real-model smoke tests and evaluation outputs are kept
in ignored `data/`. Data, model weights, credentials, and large outputs are excluded
from git. Retain upstream dataset attribution and licence terms when redistributing.
Choose a project licence before publishing the hackathon submission.

Sources: [challenge presentation](https://hackapertus-topic-classification-5c233f.gitlab.io/),
[OpenParlData exports](https://files.openparldata.ch/exports/),
[challenge datasets](https://files.openparldata.ch/hackapertus/),
[API](https://api.openparldata.ch/documentation),
[E5 model card](https://huggingface.co/intfloat/multilingual-e5-small).
