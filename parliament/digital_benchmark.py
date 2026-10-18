import argparse
import json
import time
from collections import Counter, defaultdict

from parliament import classifier, db
from parliament.config import DATA, PROMPT_VERSION, digest
from parliament.digitalisation import DEFINITION, TOPIC_ID, ensure_topic, keyword_match

DIRECTORY = DATA / "evaluation" / "digitalisation"


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2))
    temporary.replace(path)


def prepare():
    ensure_topic()
    target = DIRECTORY / "manifest.json"
    if target.exists():
        return json.loads(target.read_text())
    labels = db.query("SELECT s.scheme,s.affair_id,a.body_key,a.titles FROM source_labels s JOIN affairs a ON a.id=s.affair_id WHERE s.scheme IN ('dvs:digitalisation','politmonitor:digitalisation') ORDER BY s.scheme,s.affair_id")
    dvs = [item for item in labels if item["scheme"] == "dvs:digitalisation"]
    if not dvs:
        raise ValueError("Bootstrap the challenge source labels first")
    dvs_ids = {item["affair_id"] for item in dvs}
    cohort = []
    for index, item in enumerate(dvs):
        titles = json.loads(item["titles"])
        available = [language for language in ("de", "fr", "it") if titles.get(language)]
        if not available:
            raise ValueError(f"No supported title language: {item['affair_id']}")
        language = available[index % len(available)]
        cohort.append({"affair_id": item["affair_id"], "body": item["body_key"], "language": language,
                       "title": titles[language], "reference": "dvs", "expected": "relevant"})
    selected = set(dvs_ids)
    for language in ("de", "fr", "it"):
        candidates = [item for item in labels if item["scheme"] == "politmonitor:digitalisation" and item["affair_id"] not in selected and json.loads(item["titles"]).get(language)]
        candidates.sort(key=lambda item: (item["body_key"] == "CHE", digest(["digitalisation-v1", item["affair_id"]])))
        for item in candidates[:4]:
            selected.add(item["affair_id"])
            cohort.append({"affair_id": item["affair_id"], "body": item["body_key"], "language": language,
                           "title": json.loads(item["titles"])[language], "reference": "politmonitor", "expected": "relevant"})
    manifest = {"version": 1, "topic_id": TOPIC_ID, "definition": DEFINITION, "model": classifier.model_name(),
                "prompt_version": PROMPT_VERSION, "source_labels_hash": digest(labels), "cohort": cohort,
                "method": "All available DVS IDs plus four deterministic additional PolitMonitor positives per DE/FR/IT, preferring non-federal records. DVS IDs excluded from additional selection. One language per affair; no training or prompt examples. Fixed before inference.",
                "source": "https://files.openparldata.ch/hackapertus/README.md"}
    manifest["manifest_hash"] = digest(manifest)
    write_json(target, manifest)
    return manifest


def summarize(manifest, results):
    records = []
    groups = defaultdict(list)
    diagnostics = Counter()
    for item in manifest["cohort"]:
        result = results.get(str(item["affair_id"]))
        if result:
            prediction = result.get("prediction", {})
            diagnostics["api_or_pipeline_errors"] += result["status"] == "error"
            if prediction:
                diagnostics["without_substantive_text"] += not prediction.get("has_substantive_text", False)
                diagnostics["with_quote_validation_errors"] += bool(prediction.get("validation_errors"))
                diagnostics["partial_content"] += bool(prediction.get("partial_content"))
        record = {**item, "keyword_baseline": keyword_match(item["title"]),
                  "status": result["status"] if result else "pending",
                  "elapsed_seconds": result.get("elapsed_seconds") if result else None}
        records.append(record)
        groups["all"].append(record)
        groups["language:" + item["language"]].append(record)
        groups["source:" + item["reference"]].append(record)
    scores = {}
    for group, items in groups.items():
        counts = Counter(item["status"] for item in items)
        completed = len(items) - counts["pending"]
        scores[group] = {"known_positives": len(items), "completed": completed, "statuses": dict(counts),
                         "recall_of_known_positives": counts["relevant"] / len(items) if completed == len(items) else None,
                         "recovered_so_far": counts["relevant"],
                         "keyword_title_recall": sum(item["keyword_baseline"] for item in items) / len(items),
                         "precision": None, "f1": None, "accuracy": None}
    return {"manifest_hash": manifest["manifest_hash"], "model": manifest["model"], "prompt_version": manifest["prompt_version"],
            "definition": manifest["definition"], "groups": scores, "records": records, "diagnostics": dict(diagnostics),
            "limitations": ["Human editorial positive references, not complete binary ground truth. Unlisted affairs are unlabelled, not negative.",
                            "DVS and PolitMonitor overlap; additional sample excludes every DVS ID. They are not independent label sources.",
                            "This estimates recovery of curated positives, not discovery precision or full-corpus recall.",
                            "Missing sources, invalid evidence, abstentions and API errors remain in the completed-run denominator.",
                            "Keyword baseline uses titles in the selected language; Apertus uses title and fetched source content.",
                            "DVS cohort is skewed toward German. Additional language samples are small and not representative.",
                            "Reference labels and membership are never passed to the inference request."]}


def run(limit=None):
    manifest = prepare()
    if manifest["model"] != classifier.model_name() or manifest["prompt_version"] != PROMPT_VERSION or manifest["definition"] != DEFINITION:
        raise ValueError("Benchmark configuration changed; use a separate PARL_DATA_DIR for a new experiment")
    predictions = DIRECTORY / "predictions.json"
    results = json.loads(predictions.read_text()) if predictions.exists() else {}
    count = 0
    for item in manifest["cohort"]:
        identifier = str(item["affair_id"])
        if identifier in results:
            continue
        if limit is not None and count >= limit:
            break
        started = time.monotonic()
        try:
            prediction = classifier.classify(item["affair_id"], TOPIC_ID, item["language"])
            result = {"status": prediction["status"], "prediction": prediction}
        except Exception as error:
            result = {"status": "error", "error_type": type(error).__name__}
        result["elapsed_seconds"] = round(time.monotonic() - started, 3)
        results[identifier] = result
        write_json(predictions, results)
        write_json(DIRECTORY / "report.json", summarize(manifest, results))
        print(f"{identifier} {item['language']}: {result['status']}", flush=True)
        count += 1
    report = summarize(manifest, results)
    write_json(DIRECTORY / "report.json", report)
    return report


def published_report():
    target = DIRECTORY / "report.json"
    return json.loads(target.read_text()) if target.exists() else {"groups": {}, "records": [], "limitations": ["Benchmark not run yet. Use python -m parliament.digital_benchmark run."]}


def federal_proxy_baseline():
    rows = db.query("SELECT s.affair_id,s.labels FROM source_labels s JOIN affairs a ON a.id=s.affair_id WHERE s.scheme='curia_vista' AND a.body_key='CHE' AND TRY_CAST(a.begin_date AS DATE)>=DATE '2018-01-01'")
    positives = {item["affair_id"] for item in db.query("SELECT affair_id FROM source_labels WHERE scheme='politmonitor:digitalisation'")}
    expected = predicted = intersection = classified = 0
    for item in rows:
        label = json.loads(item["labels"])
        if not label.get("topic_ids"):
            continue
        classified += 1
        actual = item["affair_id"] in positives
        guessed = "Medien und Kommunikation" in label.get("topics_de", [])
        expected += actual
        predicted += guessed
        intersection += actual and guessed
    return {"cohort": "Federal affairs since 2018 with non-empty Curia Vista subject areas", "affairs": classified, "tagged_positives": expected,
            "media_communication": predicted, "intersection": intersection,
            "recall_of_editorial_tags": intersection / expected if expected else None,
            "editorial_tag_agreement_among_proxy_matches": intersection / predicted if predicted else None,
            "note": "Second ratio is agreement with an incomplete positive list, NOT ground-truth precision. Reproduces the slide's simple subject-area proxy."}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Frozen positive-reference digitalisation benchmark")
    parser.add_argument("command", choices=["prepare", "run", "report", "baseline"])
    parser.add_argument("--limit", type=int)
    arguments = parser.parse_args()
    if arguments.limit is not None and arguments.limit < 1:
        parser.error("--limit must be positive")
    result = prepare() if arguments.command == "prepare" else run(arguments.limit) if arguments.command == "run" else federal_proxy_baseline() if arguments.command == "baseline" else published_report()
    print(json.dumps(result, ensure_ascii=False, indent=2))
