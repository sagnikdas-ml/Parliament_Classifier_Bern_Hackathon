# PoliNews

## Quick start (local demo)

1. Put your Keera API key in a file named `.key` in this project folder (next to
   `api.py`). Restrict access to it with `chmod 600 .key`. Keep the key private.
2. Start PoliNews:

   ```bash
   bash scripts/run_demo.sh
   ```

   The script uses the project's `.venv`. If it is missing, set up the Python
   environment using the installation steps later in this README.
3. Open [http://127.0.0.1:8000](http://127.0.0.1:8000) in your browser.
4. On **News Fact Checker**, paste a news story, choose its language and Apertus
   model (8B or 70B), then select **Check this story**. Review highlighted claims
   and open the linked archive evidence; apply a suggested correction to the draft
   only when its cited evidence supports it.
5. Scroll down to **Archive classification** to see the automatic APS run across
   up to 300,000 affairs. The backend starts it when PoliNews launches and keeps
   it running independently of the browser. The page shows completed cases,
   current run-rate, and a finish-time estimate that updates during the run.

To stop the local server, press **Ctrl+C** in the terminal where it is running.

## News fact checker

The opening screen now accepts multi-sentence news (up to 40 sentences / 12,000
characters). **Research archives** retains the existing topic-classification workflow.
Apertus identifies Swiss parliamentary, other political, apolitical or uncertain
scope with adjacent sentence context and DuckDB-retrieved candidates and passages. Missing archive matches do not establish that a sentence is apolitical. Apolitical rows are collapsed; expand them to
inspect the text. Scope exclusions offer **Check against archives anyway**.

Supported input and explanation/correction languages are **English, German, French,
Italian and Romansh** (`en`, `de`, `fr`, `it`, `rm`). The language selector controls
explanations and corrections; archive quotations stay in their original language.
Interface controls and APS catalogue labels retain their existing English/DE/FR labels.

Retrieval searches the full DuckDB catalogue. Exact quoted affair titles take priority;
referential follow-up sentences inherit the preceding named affair. Unanchored searches
combine multilingual keywords and the available semantic index. Missing source text is
fetched for up to three selected affairs and cached in DuckDB. Up to eight source windows
are retained, with a cap of three per affair so long documents cannot crowd out others.
Catalogue coverage, cached-text coverage and embedding coverage are shown separately.
This is bounded retrieval, not exhaustive verification or a complete archive refresh.
Titles and title duplicates cannot serve as fact-check evidence.

Political sentences with unverified or contradicted claims show **Needs review**
notices and contribute to the editorial review count. Uncertain political scope also
gets a review notice. Apolitical sentences never contribute to these notices or counts,
even after a manual archive check. Other political news is also assessed, with archive
coverage limitations producing unverified results rather than false verdicts.

Claims within a sentence receive supported, contradicted, unverified or not-factual
labels. Mixed sentences display separate coloured claim cards. Supported and
contradicted verdicts require selecting original source quotations by ID and a separate model review
of entailment, entities, dates and procedural status. Corrections appear only for
contradicted claims when that review also supports the correction. Invalid quotes
or rejected reviews become unverified. No matches never means false. Opinions
also undergo a second review before being marked not factual.

Results show APS topics for cited affairs, using the existing classifier with a
multilingual embedding shortlist of taxonomy definitions. Journalists can also draft,
review and save up to three ad-hoc topics, then select them for a news run. Apertus
classifies cited affairs against those definitions without retraining; each accepted
match includes a source passage. Source provenance includes
the affair author when available, original record link, affair start date and labelled
recorded events. An affair author is not automatically the speaker of every passage;
start/submission dates are not automatically dates of incidents. Contributor and event
responses are cached in DuckDB. Corrections have their own evidence and entailment check.

`POST /api/fact-checks` accepts `{"text":"Your news here.","language":"en","topic_ids":["custom:..."]}` and returns a run ID
and sentence offsets. `POST /api/fact-checks/{id}/sentences/{index}` checks one
sentence; `?force_archive=true` overrides scope exclusion. Requests use the existing
backend authentication and Worker gateway. Runs and results persist in DuckDB's
`fact_checks` and `fact_check_sentences` tables, including model/version and evidence
hashes. Retries reassess current archives. The browser supports stop after the current
sentence and resume unfinished sentences while the page remains open.

Evidence gates do not guarantee factual accuracy: scope, claim decomposition and
entailment still rely on the LLM, and retrieval can miss relevant evidence. A source
allegation does not establish real-world truth. The existing topic benchmark is not
a fact-checking accuracy evaluation. Automated regression tests use mocked model
responses. A small live regression set is available via `PYTHONPATH=. .venv/bin/python scripts/check_news_live.py` (uses configured inference credentials). Its results in `evaluation/news-live-regression.json` are not an independent accuracy benchmark or proof of equal quality across languages.

## Journalist demo: PoliNews

The **Research archives** tab retains the research workflow: enter a natural-language question
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
http://127.0.0.1:8000. The home page puts the multi-sentence news fact-checker
first, with inline claim highlighting, archive-backed suggested replacements,
source citations, and a one-click apply-to-draft action. News runs can pin either
`apertus-v1-5-8b` or `apertus-v1-5-70b`; each run keeps the chosen model. The
archive-research workspace, source inspection, human corrections, custom topics,
and Markdown evidence shortlists remain available.
The original classification/evaluation dashboard remains at `/admin`.

The default inference model is `apertus-v1-5-70b` (tool-call variant, not thinking).
The UI also supports `apertus-v1-5-8b` for a faster/less costly option. The Archive
Classification panel runs a representative 100-affair pilot or resumable APS/custom-topic jobs
of up to 500,000 affairs, including the full currently indexed collection. It reports a 300,000-affair projection from a completed
100-case run on this installation. This is a linear planning estimate, sensitive
to cache hits, archive text availability, model latency, and retries—not a runtime
guarantee or a measured full-corpus result. Full-corpus jobs queue records inside
DuckDB and process in bounded pages; completed work remains saved if interrupted.
The live news regression currently passes 14/14 expected scenario outcomes across
the five supported languages, including cited political claims, a sourced correction,
and unsupported political content. This is a small smoke set, not an independent
accuracy benchmark; use the app for human-reviewed journalism, not unattended
publication. A historical seven-case check found problems with the earlier 8B APS
classifier; exact quotations prove traceability, not correctness. See `VALIDATION.md`
and `evaluation/news-live-regression.json`.

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

2. **Provide the Apertus (Keera) API key** in `.key` at the repository root
   (beside `api.py`) and restrict its permissions:

   ```bash
   chmod 600 .key
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
   | <http://127.0.0.1:8000/> | PoliNews (journalist workflow) |
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
| `APERTUS_MODEL` | `apertus-v1-5-70b` |
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

Background jobs have explicit affair caps (maximum 500,000 per job), one inference
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

### Live LLM judge

The archive page automatically evaluates completed classifications with a separate
`apertus-v1-5-70b` (non-thinking) pass through Keera, using the same `.key` file.
The judge reads cached archive text and the full topic catalogue without seeing
the original prediction. Its exact evidence quotations are checked against the
source before its labels become model-generated references.

The quality panel refreshes every six seconds: exact topic-set and relevance-status agreement, micro
precision, recall and F1, plus judged, awaiting, abstained and failed counts.
These are **LLM-judge estimates**, not human-verified accuracy. Same-family models
can share mistakes. Missing or truncated source text, changed sources/taxonomies,
and judge abstentions are excluded from scoring; failed calls are retried up to
three times, with one focused source-quote repair pass for invalid citations.
Frozen human-review scores remain separate in the API.

Judgments persist in DuckDB and resume automatically after restart. Evaluation
adds 70B inference calls and shares inference capacity with the other tools;
classification progress and judge coverage can therefore advance at different
rates. No additional service or API key is required.
