# Local validation — 18 October 2026

## Natural-language, date-bounded workflow

The single-screen interface now retrieves up to ten candidates for an interpreted
question/date range, then automatically classifies and translates each row. English
titles and accepted evidence passages are labelled machine translations and shown
alongside their originals. Dialogs hold supporting details; the main results paginate
to fit available height. This layout is implemented but has not been visually verified
in a browser, because no browser automation surface was available.

The live OpenParlData check returned out-of-range/null-dated records despite documented
`date_from`/`date_to` parameters. The new workflow therefore rejects out-of-range records
locally before import and ranking. Three bounded live language searches supplement the
local catalogue; this is not exhaustive synchronization or scheduled monitoring.

A real Worker-proxied question about public-sector AI between 1 and 18 October 2026
produced four candidates, all within the requested dates. All four received classifications
and English translations without pipeline errors. Generated artifacts are stored under
`data/evaluation/natural-query-smoke.json`. This is an integration check, not an accuracy
or translation-quality evaluation. The fixed digitalisation benchmark below remains
separate and must not be represented as validating arbitrary natural-language queries.

## Focused digitalisation benchmark

The default interface is now digital-policy monitoring, not general topic creation.
The fixed 42-case DVS/PolitMonitor reference run recovered 20 positives (47.6%), versus
22 (52.4%) for title keywords. All 42 completed; 22 abstained. This does not establish
precision or full binary accuracy because the supplied lists contain only positives.
See `evaluation/BENCHMARK.md` and `evaluation/digitalisation-result.json` for exact
cohorts, per-language results, source/evidence failures and reproducible commands.

The source-data baseline exactly reproduces the slides' 1,120/1,385 known-positive
recall and 1,120/2,740 tag agreement when restricted to federal affairs since 2018
with non-empty Curia Vista subject areas. The earlier seven-case APS audit below
remains a separate, AI-assisted diagnostic, not the digitalisation ground truth.

## Journalist workspace update

- Added the source-first journalist workflow, deterministic Markdown evidence brief,
  backend filters, separate corrections, and a local Cloudflare Worker gateway.
- All 25 Python regression tests and five Worker gateway tests pass. TypeScript
  checking and Wrangler's deployment dry run pass; no cloud deployment was made.
- The running local app was exercised through HTTP: home page, topic approval,
  candidate retrieval, real Apertus inference, and Markdown evidence export.
- The local Worker at port 8787 serves the page, forwards `/api/status` and
  `/api/brief` successfully, and rejects the unexposed `/api/jobs` route. Both
  direct Python and Worker-proxied evidence export were exercised.
- Browser automation was unavailable; visual layout and interactive browser testing
  still need a human check. Syntax and API checks are not a substitute for that.

### Bounded labelled-sample check: significant quality limitation

`python -m parliament.research_evaluation` checks exact annotation quotations against
cached sources, excludes stale predictions, and evaluates the existing model output.
The annotations are in `evaluation/journalist-sample.json`: seven convenience-selected
affairs, reviewed from source excerpts by an AI assistant, not independent human gold.
No classifier tuning was performed using this sample.

| Language | Affairs | Micro precision | Micro recall |
| --- | ---: | ---: | ---: |
| German | 3 | 0.00 | 0.00 |
| French | 3 | 0.00 | 0.00 |
| Italian | 1 | 0.00 | 0.00 |
| Combined | 7 | 0.00 | 0.00 |

Five returned labels did not match the specific reference subjects; two affairs
abstained. Abstentions count as empty predictions, not excluded examples. This
sample is too small and non-independent to estimate corpus accuracy, but it is
clear evidence that the existing 8B APS classifier is **not ready for unattended
use**. Quote validation does not establish semantic label correctness. This is a
working review prototype, not a validated editorial decision system.

DVS digitalisation remains supported as a custom topic and source-label dataset,
but this update does not supply a new DVS quality score. Human-labelled negatives
and a larger independently reviewed multilingual sample remain necessary before
claims about classification precision, language parity, or production readiness.

The live custom-topic check on affair 341641 returned a traceable quotation about
perinatal care; that quotation alone does not establish affordable-childcare policy.
Treat it as an example for human relevance review, not a proven true positive.

A second live custom-topic check on affair 495 (Stadt Zug childcare fees) returned
a directly relevant fee-policy passage, with no quote-validation errors, in 3.408s
after source preparation. The record is longer than the input cap and is correctly
marked partial. This demonstrates the workflow, not a general accuracy result.

## Implemented and exercised

- Imported 326,396 affairs and the complete 165-topic APS catalogue into DuckDB.
- Prepared 490,770 title/text units for portable full-corpus embedding. This includes
  all available imported titles and currently cached texts, **not every document**.
- Embedded 4,377 passages from the initial 200-affair sample on Apple MPS; imported Parquet results and
  exercised hybrid retrieval against the complete metadata catalogue.
- Completed the capped 200-affair Apertus job `4dd376bb716c48bc`: 68 German, 66 French,
  and 66 Italian affairs, with no failed job items.
- Produced suggested APS labels for 139 sample affairs; abstained on 61. An abstention
  can mean unavailable content or evidence that failed exact-source verification.
- Exercised real custom-topic drafting and classification using the St. Gallen
  digital-administration affair 79359 in a separate test database.
- Passed 20 automated tests, Python compilation, JavaScript syntax checking,
  shell syntax checking, dependency consistency, and API route smoke checks.

The initial unconstrained/JSON-object prompt produced malformed outputs. The final
implementation uses JSON-schema constrained decoding with named topic choices.
Evidence quotations are located in supplied text before being linked to a source;
unverifiable evidence is rejected. Attached meeting documents can contain unrelated
affairs, so prompts explicitly scope classification to the target affair's title.

## Performance observation

An initial retrieval benchmark with 200 embedded affairs and 326,396 imported
metadata records measured 11.154 seconds for the cold query, followed by 0.275 and
0.266 seconds for warm queries. Peak process RSS was approximately 881 MB. These
figures include model loading on the cold query and do not measure total system
memory or a fully embedded corpus. Rerun `python -m parliament benchmark` after
importing a larger index.

The final sample embedding run, including document text fetched during classification,
produced 4,377 passages in 106.417 seconds with approximately 844 MB peak process RSS.

Detailed generated artifacts are excluded from git:

- `data/evaluation/report.json`: inference timing, tokens, abstentions, and validation failures.
- `data/evaluation/custom-smoke.json`: isolated custom-topic API smoke result.
- `data/evaluation/retrieval-benchmark.json`: measured retrieval performance and coverage.
- `data/embeddings/*/complete.json`: embedding progress/completion and, for the final run, runtime/memory.

## Still requires human or cluster validation

- **No APS accuracy score is claimed.** Review and freeze 30–50 labels in the UI.
  A verified quotation establishes provenance, not correctness of a topic assignment.
  Some successful classifications also contain rejected evidence from other chunks.
- Long affairs are capped at three content chunks and marked partial; partial review
  cannot yield a definitive negative classification.
- The Slurm wrapper is tested with a fake submission command and shell syntax checks,
  but has not been submitted to FAU. Partition/account availability remains site-specific.
- API integration and frontend JavaScript syntax were checked. A browser surface was
  unavailable in this session, so visual/browser interaction testing remains outstanding.
- Romansh retrieval/classification and full-corpus vector-search latency are unverified.
