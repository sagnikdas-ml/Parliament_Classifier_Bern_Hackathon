import html
import json
import re
from urllib.parse import urlsplit

from parliament import classifier, db


def plain(value):
    value = html.escape(str(value or ""), quote=False)
    return re.sub(r"([\\`*_{}\[\]()#+.!|>~-])", r"\\\1", value).replace("\n", " ").replace("\r", " ")


def source_link(value):
    url = str(value or "")
    parsed = urlsplit(url)
    if parsed.scheme not in {"https", "http"} or not parsed.netloc:
        return "Source link unavailable"
    url = url.replace("<", "%3C").replace(">", "%3E").replace("\n", "").replace("\r", "")
    return f"[Original source](<{url}>)"


def export_brief(title, affair_ids, topic_id):
    catalogue, version = classifier.topic_context(topic_id)
    lines = [f"# {plain(title)}", "", "Research shortlist — not a verified article or a complete inventory.",
             f"Topic: {plain(topic_id)} · definition version: {plain(version)}", "",
             "Labels are model suggestions, not findings of fact. Proposals are not enacted laws; statements in records are attributed claims.",
             "Coverage is limited to locally retrieved records. Missing documents and unclassified affairs may hide relevant results.", ""]
    if topic_id != "aps":
        lines.extend(["## Reporting scope", plain(catalogue[0]["definition"]), ""])
    for identifier in dict.fromkeys(affair_ids):
        records = db.query("SELECT * FROM affairs WHERE id=?", [identifier])
        if not records:
            raise ValueError(f"Affair {identifier} is not cached; open it before exporting")
        record = records[0]
        titles = json.loads(record["titles"])
        lines.extend([f"## {identifier}: {plain(next(iter(titles.values()), 'Untitled'))}",
                      f"Jurisdiction: {plain(record['body_key'])} · record date: {plain(record['begin_date'] or 'Unknown')}",
                      source_link(record["source_url"]), ""])
        predictions = [json.loads(item["result"]) for item in db.query(
            "SELECT result FROM classifications WHERE affair_id=? AND topic_id=? ORDER BY created_at DESC", [identifier, topic_id])]
        prediction = next((item for item in predictions if classifier.result_is_current(item)), None)
        if not prediction:
            lines.extend(["Candidate only: no current classification. Historical predictions, if any, are excluded.", ""])
            continue
        lines.extend([f"Model suggestion: {plain(prediction['status'])} · language: {plain(prediction['language'])}",
                      f"Model: {plain(prediction['model'])} · prompt: {plain(prediction['prompt_version'])}", ""])
        for label in prediction["labels"]:
            evidence = label["evidence"]
            sources = db.query("SELECT text, source_url FROM units WHERE id=? AND affair_id=? AND kind<>'title'", [evidence["unit_id"], identifier])
            if not sources or not evidence["quote"] or evidence["quote"] not in sources[0]["text"]:
                lines.append("Evidence could not be revalidated; label omitted.")
                continue
            lines.extend([f"### Suggested topic: {plain(label['name'])}",
                          f"> {plain(evidence['quote'])}", source_link(sources[0]["source_url"]), ""])
        if prediction.get("partial_content"):
            lines.append("Warning: classification used only part of the available content.")
        reviews = db.query("SELECT * FROM reviews WHERE affair_id=? AND topic_id=? AND language=?", [identifier, topic_id, prediction["language"]])
        for review in reviews:
            snapshot = json.loads(review["prediction"]) if review["prediction"] else {}
            same = all(snapshot.get(key) == prediction.get(key) for key in ("content_hash", "topic_version", "model", "prompt_version", "labels"))
            lines.append(f"Separate reviewer correction ({'same source/topic version' if same else 'historical; re-review needed'}): relevant={review['relevant']}; labels={plain(review['labels'])}.")
        lines.extend(["", "Reporting checks: confirm current procedural status; read the full record; seek responses before publication.", ""])
    return "\n".join(lines)
