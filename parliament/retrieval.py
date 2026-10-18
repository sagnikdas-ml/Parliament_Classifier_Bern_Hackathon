import json
import re
import time

from parliament import db
from parliament.embeddings import query_vector


def coverage():
    return db.query("""SELECT
      (SELECT count(*) FROM affairs) AS affairs,
      (SELECT count(DISTINCT affair_id) FROM units WHERE kind='title') AS with_titles,
      (SELECT count(DISTINCT affair_id) FROM units WHERE kind<>'title') AS with_text,
      (SELECT count(DISTINCT u.affair_id) FROM embeddings e JOIN units u
        ON e.unit_id=u.id AND e.content_hash=u.content_hash) AS with_embeddings,
      (SELECT count(DISTINCT affair_id) FROM classifications) AS ever_classified,
      (SELECT count(*) FROM topics WHERE scheme='aps') AS aps_topics
    """)[0]


def search(text, limit=30, body=None, semantic=True, language=None, date_from=None, date_to=None, terms=None, whole_words=False):
    started = time.monotonic()
    words = list(dict.fromkeys(re.findall(r"[^\W_]{3,}", text.lower(), re.UNICODE)))[:32]
    if terms is not None:
        words = list(dict.fromkeys(term.strip().casefold() for term in terms if term.strip()))[:32]
    parameters = []
    conditions = ["TRUE"]
    if body:
        conditions.append("a.body_key=?")
        parameters.append(body)
    if language:
        conditions.append("EXISTS(SELECT 1 FROM units lang WHERE lang.affair_id=a.id AND lang.language=?)")
        parameters.append(language)
    if date_from:
        conditions.append("TRY_CAST(a.begin_date AS DATE)>=CAST(? AS DATE)")
        parameters.append(str(date_from))
    if date_to:
        conditions.append("TRY_CAST(a.begin_date AS DATE)<=CAST(? AS DATE)")
        parameters.append(str(date_to))
    lexical = []
    if words:
        predicate = "regexp_matches(lower(u.text), ?)" if whole_words else "contains(lower(u.text), ?)"
        score = " + ".join(f"CASE WHEN {predicate} THEN 1 ELSE 0 END" for _ in words)
        lexical_terms = [r"(^|[^\p{L}\p{N}])" + re.escape(word) + r"([^\p{L}\p{N}]|$)" for word in words] if whole_words else words
        lexical = db.query(f"""SELECT a.id, max({score}) AS score
            FROM units u JOIN affairs a ON a.id=u.affair_id
            WHERE {' AND '.join(conditions)} GROUP BY a.id
            HAVING score>0 ORDER BY score DESC,a.id LIMIT ?""", [*lexical_terms, *parameters, max(100, limit * 3)])
    vector, pipeline = query_vector(text) if semantic else (None, None)
    dense = []
    if vector is not None:
        dense = db.query(f"""SELECT a.id, max(list_cosine_similarity(e.vector, ?::FLOAT[])) AS score
          FROM embeddings e JOIN units u ON e.unit_id=u.id AND e.content_hash=u.content_hash
          JOIN affairs a ON a.id=u.affair_id
          WHERE e.pipeline=? AND {' AND '.join(conditions)} GROUP BY a.id
          ORDER BY score DESC,a.id LIMIT ?""", [vector, pipeline, *parameters, max(100, limit * 3)])
    scores = {}
    for name, ranked in (("keyword", lexical), ("semantic", dense)):
        for rank, record in enumerate(ranked, 1):
            entry = scores.setdefault(record["id"], {"id": record["id"], "rank_score": 0})
            entry["rank_score"] += 1 / (60 + rank)
            entry[f"{name}_score"] = record["score"]
    selected = sorted(scores.values(), key=lambda item: (-item["rank_score"], item["id"]))[:limit]
    if selected:
        details = db.query("""SELECT a.id,a.body_key,a.begin_date,a.titles,a.source_url,
            EXISTS(SELECT 1 FROM units u WHERE u.affair_id=a.id AND u.kind<>'title') AS has_full_text
            FROM affairs a WHERE a.id IN (SELECT unnest(?::BIGINT[]))""", [[item["id"] for item in selected]])
        indexed = {item["id"]: item for item in details}
        for item in selected:
            item.update(indexed[item["id"]])
            item["titles"] = json.loads(item["titles"])
    return {"results": selected, "coverage": coverage(), "semantic_enabled": vector is not None,
            "elapsed_seconds": round(time.monotonic() - started, 3),
            "notice": "Candidates are not confirmed topic matches. Title-only retrieval can miss relevant affairs."}
