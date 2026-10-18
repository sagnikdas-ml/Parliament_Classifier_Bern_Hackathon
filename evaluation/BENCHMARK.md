# Digitalisation: reference benchmark

## What the presentation actually provides

The [challenge slides](https://hackapertus-topic-classification-5c233f.gitlab.io/slides.md)
identify digitalisation monitoring for Digital Administration Switzerland (DVS) as
the practical validation case. Their datasets include:

- 3,433 affairs tagged digitalisation by PolitMonitor editors, from 35 parliaments.
- 30 affairs on the DVS snapshot list; 29 also appear in the PolitMonitor data.
- 70,008 federal affairs with Curia Vista labels, including 28 subject areas.
- The APS taxonomy, **not** affair-level APS gold labels.

See the [dataset documentation](https://files.openparldata.ch/hackapertus/README.md).
Editorial labels are real reference annotations. They can still be incomplete or
reflect a broader interpretation than our operational scope.

## What we can measure honestly

The digitalisation files contain positives, not verified negatives. Measure recall
of these known positives. Do not turn every unlisted affair into a confirmed negative
or advertise precision, F1, specificity, or overall accuracy on that basis.

Curia Vista provides a genuine multi-label benchmark **for its own 28 categories**;
it is not ground truth for the 165-topic APS scheme. A crosswalk cannot silently turn
one into the other. We are prioritising the supported digitalisation use case instead
of expanding into another general-purpose classifier.

## Fixed local experiment

```sh
python -m parliament.digital_benchmark prepare
python -m parliament.digital_benchmark run
python -m parliament.digital_benchmark report
python -m parliament.digital_benchmark baseline
```

The frozen cohort contains all 30 supplied DVS affairs and 12 additional PolitMonitor
positives: four deterministic records per German, French and Italian, preferring
non-federal records. Every DVS ID is excluded from the additional sample. Each affair
is tested in one language only. DVS itself is German-heavy; this is not a balanced
population estimate. The samples share a label source, so they are not independent
validation datasets.

The manifest freezes IDs, languages, scope, model, prompt version and a source-label
hash before inference. Predictions checkpoint after each affair. Running again resumes
unfinished items, not already recorded errors. Model/prompt/scope changes are rejected;
use a separate experiment data directory to compare a different configuration.
`--limit N` runs at most N additional affairs; an incomplete run reports no total recall.

The inference function receives only the scope and affair content, never labels,
reference membership, or example answers. Reference cases are not used for training.
All abstentions, missing sources, invalid evidence and errors stay in the complete-run
denominator. Original predictions and content hashes are retained for inspection.

Artifacts live in ignored `data/evaluation/digitalisation/`:
`manifest.json`, `predictions.json`, `report.json`. The application displays the report
and lets the user inspect successes and misses. These are frozen-run results; they
do not automatically change when individual affairs are later reviewed.

## Baselines

1. Fixed multilingual keyword matching against the title in the tested language.
   Apertus sees more content; this is a practical title-search baseline, not a
   controlled equal-context model comparison.
2. The presentation's Curia Vista proxy: federal affairs since 2018 **with non-empty
   subject areas**, using “Medien und Kommunikation” as a digitalisation proxy.
   Reproduction yields 1,120 overlaps / 1,385 editorial positives (80.9% recall), and
   1,120 / 2,740 proxy matches (40.9% editorial-tag agreement). The latter is not
   precision against exhaustively verified negatives. Excluding empty subject-area
   records is essential to reproducing the slide's cohort.

## Measured result: 18 October 2026

Model: `apertus-v1-5-8b`, prompt `named-policy-evidence-v3`, fixed scope v1.
The machine-readable result, including individual IDs and outcomes, is committed
in `evaluation/digitalisation-result.json`. No prompt changes were made after
examining this benchmark to improve its reported score.

| Cohort | Known positives | Recovered | Recall | Title-keyword recall |
| --- | ---: | ---: | ---: | ---: |
| All | 42 | 20 | 47.6% | 52.4% |
| DVS | 30 | 13 | 43.3% | 60.0% |
| Additional PolitMonitor | 12 | 7 | 58.3% | 33.3% |
| German | 25 | 11 | 44.0% | 56.0% |
| French | 11 | 5 | 45.5% | 54.5% |
| Italian | 6 | 4 | 66.7% | 33.3% |

All 42 ran without pipeline/API exceptions. There were 22 abstentions; 10 affairs
lacked substantive text, 20 had at least one rejected quote, and 10 were partial.
These diagnostic counts overlap and can include affairs with another accepted quote.
The model **does not beat the title-keyword baseline overall**. In particular, do not
market the additional-sample result as representative of all parliaments. This
measurement identifies source acquisition and evidence generation as concrete next
engineering targets, not a reason to remove difficult affairs from evaluation.

The 81% Curia Vista proxy result uses a different, federal-only cohort and must not
be directly ranked against the 42-case model score as though the samples were identical.

## Next step for true binary ground truth

Before claiming precision, freeze a separate prospective sample from matching
parliaments and periods, including both model matches and non-matches. Have humans
label each affair against the written definition without seeing model outputs or
source-list membership. Double-review disagreements and mark unresolved cases
uncertain. Keep all versions/translations of an affair in the same split. Reserve an
untouched test set before tuning. Report precision/recall, abstentions, source coverage,
language/level breakdowns and uncertainty; stratified sampling needs weighting before
estimating population precision. This human work has not been performed by the agent.
