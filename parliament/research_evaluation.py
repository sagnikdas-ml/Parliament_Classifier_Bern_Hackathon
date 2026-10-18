import json
from collections import defaultdict

from parliament import classifier, db
from parliament.config import ROOT, digest
from parliament.evaluation import metrics


def evaluate():
    annotations = json.loads((ROOT / "evaluation" / "journalist-sample.json").read_text())
    pairs = []
    languages = defaultdict(list)
    records = []
    for annotation in annotations["affairs"]:
        evidence = annotation["evidence"]
        source = db.query("SELECT text,content_hash FROM units WHERE id=? AND affair_id=?", [evidence["unit_id"], annotation["affair_id"]])
        if not source or evidence["quote"] not in source[0]["text"]:
            raise ValueError(f"Annotation evidence does not match cached source: {annotation['affair_id']}")
        saved = db.query("SELECT result FROM classifications WHERE affair_id=? AND language=? AND topic_id='aps' ORDER BY created_at DESC", [annotation["affair_id"], annotation["language"]])
        prediction = next((value for item in saved if classifier.result_is_current(value := json.loads(item["result"]))), None)
        if prediction is None:
            raise ValueError(f"Current prediction needed: {annotation['affair_id']}")
        pair = (set(annotation["labels"]), {label["topic_id"] for label in prediction["labels"]})
        pairs.append(pair)
        languages[annotation["language"]].append(pair)
        records.append({"affair_id": annotation["affair_id"], "language": annotation["language"], "expected": sorted(pair[0]),
                        "predicted": sorted(pair[1]), "status": prediction["status"], "prompt_version": prediction["prompt_version"],
                        "model": prediction["model"], "content_hash": prediction["content_hash"], "elapsed_seconds": prediction["elapsed_seconds"]})
    return {"reviewer_type": annotations["reviewer_type"], "method": annotations["method"], "annotation_hash": digest(annotations),
            "metrics": metrics(pairs), "by_language": {key: metrics(value) for key, value in languages.items()}, "records": records,
            "limitations": ["Seven selected examples only; Italian n=1. Not a production accuracy estimate.",
                            "Human verification remains required. Source excerpts may omit secondary subjects.",
                            "Abstentions are scored as empty predictions, not removed from the denominator.",
                            "No DVS precision estimate: available positive lists do not supply negative labels."]}


if __name__ == "__main__":
    print(json.dumps(evaluate(), ensure_ascii=False, indent=2))
