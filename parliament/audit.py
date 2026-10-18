import argparse
import json
from pathlib import Path

from parliament import db
from parliament.classifier import classify, source_units, topic_context
from parliament.config import DATA, ROOT, digest, json_text
from parliament.evaluation import evaluation_sample, metrics

AUDIT = DATA / "evaluation" / "review40"
ANNOTATIONS = ROOT / "evaluation" / "assistant-review.json"


def prepare():
    AUDIT.mkdir(parents=True, exist_ok=True)
    if (AUDIT / "cohort.json").exists():
        return json.loads((AUDIT / "cohort.json").read_text())
    cohort, sources, baseline = [], {}, {}
    for candidate in evaluation_sample(200):
        units, language = source_units(candidate["affair_id"], candidate["language"], fetch=False)
        titles = {item["text"] for item in units if item["kind"] == "title"}
        substantive = [item for item in units if item["kind"] != "title" and len(item["text"]) > 200 and item["text"] not in titles]
        if not substantive:
            continue
        identifier = str(candidate["affair_id"])
        prediction = db.query("SELECT result FROM classifications WHERE affair_id=? AND language=? AND topic_id='aps' AND prompt_version='named-policy-evidence-v3' ORDER BY created_at DESC LIMIT 1", [candidate["affair_id"], language])
        if not prediction:
            continue
        cohort.append({**candidate, "title": next(iter(titles), ""), "split": "development" if len(cohort) % 2 == 0 else "held_out", "content_hash": digest([(item["id"], item["content_hash"]) for item in units])})
        sources[identifier] = units
        baseline[identifier] = json.loads(prediction[0]["result"])
        if len(cohort) == 40:
            break
    if len(cohort) != 40:
        raise ValueError("Need 40 baseline affairs with substantive source text")
    for name, value in (("cohort", cohort), ("sources", sources), ("baseline", baseline)):
        (AUDIT / f"{name}.json").write_text(json.dumps(value, ensure_ascii=False, indent=2))
    return cohort


def show(split, offset, count, characters):
    cohort = [item for item in prepare() if item["split"] == split][offset:offset + count]
    sources = json.loads((AUDIT / "sources.json").read_text())
    output = []
    for item in cohort:
        units = sources[str(item["affair_id"])]
        output.append({**item, "sources": [{"id": unit["id"], "kind": unit["kind"], "length": len(unit["text"]), "text": unit["text"][:characters], "source_url": unit["source_url"]} for unit in units]})
    return output


def annotations():
    value = json.loads(ANNOTATIONS.read_text())
    if value["reviewer_type"] != "ai_assisted":
        raise ValueError("This audit must not be labelled human review")
    return value["affairs"]


def freeze(split):
    records = [item for item in annotations() if item["split"] == split]
    cohort = {item["affair_id"]: item for item in prepare() if item["split"] == split}
    if len(records) != len(cohort) or {item["affair_id"] for item in records} != set(cohort):
        raise ValueError("Every affair in this split must be reviewed exactly once")
    sources = json.loads((AUDIT / "sources.json").read_text())
    allowed = {item["id"] for item in topic_context("aps")[0]}
    for record in records:
        if any(label not in allowed for label in record["labels"]):
            raise ValueError("Unknown annotation label")
        indexed = {item["id"]: item for item in sources[str(record["affair_id"])]}
        for evidence in record["evidence"]:
            if evidence["unit_id"] not in indexed or evidence["quote"] not in indexed[evidence["unit_id"]]["text"]:
                raise ValueError(f"Unverifiable reviewer quote for {record['affair_id']}")
        if record["reviewable"] and (not record["labels"] or not record["evidence"]):
            raise ValueError("Scored APS annotations need labels and source evidence")
    target = AUDIT / f"frozen-{split}.json"
    if target.exists() and json.loads(target.read_text()) != records:
        raise ValueError("Frozen review split cannot be overwritten")
    target.write_text(json.dumps(records, ensure_ascii=False, indent=2))
    return {"frozen": split, "records": len(records), "annotation_hash": digest(records)}


def run(split):
    if not (AUDIT / f"frozen-{split}.json").exists():
        raise ValueError("Freeze annotations before evaluating predictions")
    from parliament.config import PROMPT_VERSION
    target = AUDIT / f"predictions-{PROMPT_VERSION}-{split}.json"
    results = json.loads(target.read_text()) if target.exists() else {}
    for item in prepare():
        if item["split"] != split or str(item["affair_id"]) in results:
            continue
        results[str(item["affair_id"])] = classify(item["affair_id"], "aps", item["language"], fetch=False)
        target.write_text(json.dumps(results, ensure_ascii=False, indent=2))
        print(f"{split}: {len(results)}/20", flush=True)
    return {"predictions": str(target), "count": len(results)}


def compare(split, candidate=None):
    records = json.loads((AUDIT / f"frozen-{split}.json").read_text())
    baseline = json.loads((AUDIT / "baseline.json").read_text())
    methods = {"baseline": baseline}
    if candidate:
        methods["candidate"] = json.loads(Path(candidate).read_text())
    output = {"split": split, "reviewer_type": "ai_assisted", "reviewed": len(records), "scored": sum(item["reviewable"] for item in records), "methods": {}}
    for name, predictions in methods.items():
        scored = [item for item in records if item["reviewable"]]
        if any(str(item["affair_id"]) not in predictions for item in scored):
            raise ValueError("Incomplete predictions for scored cohort")
        pairs = [(set(item["labels"]), {label["topic_id"] for label in predictions[str(item["affair_id"])]["labels"]}) for item in scored]
        cases = []
        for item, pair in zip(scored, pairs):
            result = predictions[str(item["affair_id"])]
            cases.append({"affair_id": item["affair_id"], "expected": sorted(pair[0]), "predicted": sorted(pair[1]), "status": result["status"], "validation_errors": result["validation_errors"]})
        output["methods"][name] = {"metrics": metrics(pairs), "cases": cases,
            "abstentions": sum(predictions[str(item["affair_id"])]["status"] == "insufficient_evidence" for item in scored),
            "prompt_tokens": sum(predictions[str(item["affair_id"])]["usage"]["prompt_tokens"] for item in scored)}
    target = AUDIT / f"comparison-{split}.json"
    target.write_text(json.dumps(output, ensure_ascii=False, indent=2))
    return output


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=["prepare", "show", "freeze", "run", "compare"])
    parser.add_argument("--split", choices=["development", "held_out"], default="development")
    parser.add_argument("--offset", type=int, default=0)
    parser.add_argument("--count", type=int, default=5)
    parser.add_argument("--characters", type=int, default=5000)
    parser.add_argument("--candidate")
    arguments = parser.parse_args()
    if arguments.action == "prepare":
        result = prepare()
    elif arguments.action == "show":
        result = show(arguments.split, arguments.offset, arguments.count, arguments.characters)
    elif arguments.action == "freeze":
        result = freeze(arguments.split)
    elif arguments.action == "run":
        result = run(arguments.split)
    else:
        result = compare(arguments.split, arguments.candidate)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
