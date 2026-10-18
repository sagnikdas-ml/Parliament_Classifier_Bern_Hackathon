# PoliNews

## User story

> As a journalist, I want to ask which parliamentary affairs concern my reporting
> topic between two dates, see the best candidates classified against that topic,
> and read English translations alongside the original evidence.

## News checking

The default screen checks multi-sentence news against DuckDB source text, fetching missing content for a bounded shortlist. Supported news and explanation/correction languages: English, German, French, Italian and Romansh.
Scope detection uses Apertus, adjacent context and DuckDB retrieval. Unverified or contradicted political claims and uncertain scope trigger an editorial “Needs review” notice. Apolitical sentences are excluded from review notices and counts. Each checkable sentence is
retrieved and assessed independently, with exact citations and a second model
review before supported/contradicted verdicts. Unsupported judgments stay unverified;
archive-supported corrections are shown separately. Mixed claims have separate
coloured cards. Apolitical rows are expandable, and excluded scopes can be checked
against archives manually. Stop/resume works within the current browser session.
Cited affairs show APS topics, available authors, labelled record/event dates and original source links. Corrections are independently checked against their cited evidence. The original research workflow remains under **Research archives**.

## Research workflow

1. Enter a natural-language question, with dates in the question or date fields.
2. Apertus extracts the reporting scope, dates, and German/French/Italian search terms.
3. Retrieve and rank up to ten candidates within the inclusive affair-start-date interval.
4. Show those candidates immediately, then classify each against the interpreted scope.
5. Translate each title and accepted evidence quotation into English with Apertus.
6. Inspect originals, correct relevance, and export selected original-source evidence.

The research tab has one compact screen. Pagination adapts to available height, with at most five
rows per page. Evidence and evaluation open in dialogs. No marketing hero, article
generator, topic-management workflow, or model catalogue in the primary interface.

## Data and processing

- The bulk-imported catalogue supplies broad metadata coverage.
- Each search adds bounded live API metadata discovery: one query per DE/FR/IT,
  up to 100 records and a 15-second network timeout per query. Full source content
  is fetched for selected candidates only. This is not an exhaustive interval update.
- All dates are checked locally before ranking. In a live check, the API returned
  out-of-range records despite its documented date parameters.
- Missing source texts/documents are fetched for classification. Already fetched
  content is cached, not continuously refreshed.
- No scheduler runs automatically. Stop halts subsequent browser requests after the
  current affair finishes; a submitted backend call may finish and populate its cache.
- Per-affair requests avoid one long ten-affair HTTP request through the Worker.
- English translations are cached by original text, evidence, model and version.
  Originals remain authoritative; translations are never used to validate quotations.
- A translation failure does not erase the classification or original text.

## Trust and limits

“Top ten” means highest ranked retrieved candidates, not ten proven relevant affairs
or a guarantee of exhaustive discovery. Fewer than ten are shown if fewer are found.
Dates refer to record start dates, not passage/adoption dates. The interpretation is
shown so the journalist can check that the model understood the question.

Machine translations are labelled. Parliamentary allegations remain allegations;
proposals do not become adopted laws. No article-ready summaries or inferred outcomes
are generated. Only original-source evidence is included in the Markdown export.

The DVS/PolitMonitor digitalisation benchmark is a separate fixed-scope evaluation.
It does not validate arbitrary question interpretation, translations, or all topic
classifications. Its measured 20/42 positive recovery, below a title-keyword baseline,
remains disclosed in Evaluation and `evaluation/BENCHMARK.md`.

## Deployment

The same assets run through local FastAPI or the Cloudflare Worker gateway.
DuckDB, embeddings and Apertus calls remain on the Python backend. Production Worker
access requires validated Cloudflare Access identity and an authenticated HTTPS origin.
The local demo is not a public deployment.

## Demo

Ask: “Find affairs about artificial intelligence in public administration between
1 October 2026 and 18 October 2026.” Check the interpreted dates, watch candidate rows
gain classifications and English titles, inspect a bilingual quotation, and export
selected evidence. Do not represent this demonstration as an accuracy evaluation.
