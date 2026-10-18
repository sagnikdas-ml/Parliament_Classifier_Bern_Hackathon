import json
from collections import defaultdict

from parliament import db
from parliament.config import DATA, PROMPT_VERSION, json_text
from parliament.ingest import sample_affairs


def evaluation_sample(limit=200):
    path = DATA / "evaluation" / f"sample-{limit}.json"
    if path.exists():
        return json.loads(path.read_text())
    sample = sample_affairs(limit)
    if not sample:
        raise ValueError("Import affair metadata first")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json_text(sample))
    return sample


def metrics(pairs):
    true_positive = false_positive = false_negative = exact = 0
    per_label = defaultdict(lambda: [0, 0, 0])
    for gold, predicted in pairs:
        true_positive += len(gold & predicted)
        false_positive += len(predicted - gold)
        false_negative += len(gold - predicted)
        exact += gold == predicted
        for label in gold | predicted:
            values = per_label[label]
            values[0] += label in gold and label in predicted
            values[1] += label not in gold and label in predicted
            values[2] += label in gold and label not in predicted
    precision = true_positive / (true_positive + false_positive) if true_positive + false_positive else 0
    recall = true_positive / (true_positive + false_negative) if true_positive + false_negative else 0
    macro = [2 * values[0] / (2 * values[0] + values[1] + values[2]) for values in per_label.values() if sum(values)]
    return {"affairs": len(pairs), "micro_precision": precision, "micro_recall": recall,
            "micro_f1": 2 * precision * recall / (precision + recall) if precision + recall else 0,
            "macro_f1_observed_labels": sum(macro) / len(macro) if macro else 0,
            "exact_match": exact / len(pairs) if pairs else 0}


def report(topic_id="aps"):
    reviews = db.query("SELECT * FROM reviews WHERE topic_id=? AND frozen=true AND prediction IS NOT NULL", [topic_id])
    pairs = []
    groups = defaultdict(list)
    for item in reviews:
        prediction = json.loads(item["prediction"])
        pair = (set(json.loads(item["labels"])), {label["topic_id"] for label in prediction["labels"]})
        pairs.append(pair)
        groups[item["language"]].append(pair)
    predictions = [json.loads(item["result"]) for item in db.query("SELECT result FROM classifications WHERE topic_id=? AND prompt_version=?", [topic_id, PROMPT_VERSION])]
    elapsed = sorted(item["elapsed_seconds"] for item in predictions)
    result = {"topic_id": topic_id, "frozen_review_metrics": metrics(pairs) if pairs else None,
              "by_language": {language: metrics(values) for language, values in groups.items()},
              "classified_versions": len(predictions),
              "latency_p50_seconds": elapsed[len(elapsed) // 2] if elapsed else None,
              "latency_p95_seconds": elapsed[min(len(elapsed) - 1, int(len(elapsed) * 0.95))] if elapsed else None,
              "prompt_tokens": sum(item["usage"]["prompt_tokens"] for item in predictions),
              "completion_tokens": sum(item["usage"]["completion_tokens"] for item in predictions),
              "insufficient_evidence": sum(item["status"] == "insufficient_evidence" for item in predictions),
              "validation_failures": sum(bool(item["validation_errors"]) for item in predictions),
              "limitations": ["APS accuracy requires frozen human reviews; no accuracy is claimed before review.",
                              "Reviews are assisted by displayed predictions, not an independent blind gold standard.",
                              "Unlisted digitalisation affairs are unlabelled, not negative examples.",
                              "Timing starts after content preparation; token totals exclude unsuccessful calls and topic drafting."]}
    return result


def digitalisation_recall(candidate_ids, body=None):
    condition = "AND a.body_key=?" if body else ""
    positives = db.query(f"SELECT s.affair_id FROM source_labels s JOIN affairs a ON a.id=s.affair_id WHERE s.scheme='politmonitor:digitalisation' {condition}", [body] if body else [])
    known = {item["affair_id"] for item in positives}
    return {"known_positives": len(known), "retrieved_positives": len(known & set(candidate_ids)),
            "recall_of_known_positives": len(known & set(candidate_ids)) / len(known) if known else None,
            "precision": None, "note": "Other candidates are unlabelled; precision requires human review."}
