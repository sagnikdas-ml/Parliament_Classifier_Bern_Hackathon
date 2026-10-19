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


def live_run_report(identifier, topic_id):
    """Evaluate this run against compatible frozen reviews; never infer gold labels."""
    counts = db.query("""
        SELECT count(*) FILTER (WHERE status='done') AS completed,
               count(*) FILTER (WHERE status='failed') AS failed,
               count(*) FILTER (WHERE status='done' AND json_extract_string(result,'$.status')='insufficient_evidence') AS insufficient_evidence,
               count(*) FILTER (WHERE status='done' AND json_extract_string(result,'$.status')='relevant') AS with_topics
        FROM job_items WHERE job_id=?
    """, [identifier])[0]
    reviewed = db.query("""
        SELECT i.result, r.labels, r.prediction
        FROM job_items i JOIN reviews r ON r.affair_id=i.affair_id
          AND r.language=json_extract_string(i.result,'$.language')
        WHERE i.job_id=? AND i.status='done' AND r.topic_id=?
          AND r.frozen=true AND r.prediction IS NOT NULL
    """, [identifier, topic_id])
    pairs, excluded = [], 0
    for row in reviewed:
        prediction, reference = json.loads(row["result"]), json.loads(row["prediction"])
        # Reviews of changed source material or a changed taxonomy cannot score this run.
        if any(not prediction.get(key) or prediction[key] != reference.get(key)
               for key in ("content_hash", "topic_version")):
            excluded += 1
            continue
        pairs.append((set(json.loads(row["labels"])), {label["topic_id"] for label in prediction.get("labels", [])}))
    scores = metrics(pairs) if pairs else None
    tp = sum(len(gold & predicted) for gold, predicted in pairs)
    fp = sum(len(predicted - gold) for gold, predicted in pairs)
    fn = sum(len(gold - predicted) for gold, predicted in pairs)
    if scores:
        scores["micro_precision"] = tp / (tp + fp) if tp + fp else None
        scores["micro_recall"] = tp / (tp + fn) if tp + fn else None
        scores["micro_f1"] = 2 * tp / (2 * tp + fp + fn) if 2 * tp + fp + fn else None
    from datetime import datetime, timezone
    return {**counts, "reviewed": len(pairs), "excluded_reviews": excluded,
            "scores": scores, "true_positive": tp, "false_positive": fp, "false_negative": fn,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "basis": "Frozen human reviews of matching source content and topic definitions. Reviews are prediction-assisted; this is not an independent or representative benchmark."}


def digitalisation_recall(candidate_ids, body=None):
    condition = "AND a.body_key=?" if body else ""
    positives = db.query(f"SELECT s.affair_id FROM source_labels s JOIN affairs a ON a.id=s.affair_id WHERE s.scheme='politmonitor:digitalisation' {condition}", [body] if body else [])
    known = {item["affair_id"] for item in positives}
    return {"known_positives": len(known), "retrieved_positives": len(known & set(candidate_ids)),
            "recall_of_known_positives": len(known & set(candidate_ids)) / len(known) if known else None,
            "precision": None, "note": "Other candidates are unlabelled; precision requires human review."}
