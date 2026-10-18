"""News-specific retrieval: resolve named affairs before broad multilingual search."""
import json
import re
from collections import defaultdict

from parliament import db, retrieval
from parliament.ingest import fetch_content

STOPWORDS = set('the and for that this with from how could should would also asks what which into have has had were was are its their they them public swiss parliamentary affair sentence der die das den dem des ein eine einer eines und oder mit von für zur zum als ist sind wird werden le la les des une un du de et dans pour sur il elle les di del della dei delle gli che con per una uno'.split())


def terms(text):
    return list(dict.fromkeys(w for w in re.findall(r'[^\W_]{3,}', text.casefold()) if w not in STOPWORDS))[:32]


def anchors(text):
    # Search every catalogue title, including affairs not embedded or downloaded yet.
    quoted = re.findall(r'["“«„]([^"”»“]{12,})["”»“]', text)
    if quoted:
        exact = db.query("""SELECT DISTINCT a.id,a.titles,a.body_key,a.source_url
            FROM units u JOIN affairs a ON a.id=u.affair_id
            WHERE u.kind='title' AND lower(trim(u.text)) IN (SELECT unnest(?::VARCHAR[]))
            ORDER BY a.id LIMIT 8""", [[q.strip().lower() for q in quoted]])
        if exact:
            return exact
    matched = db.query("""SELECT a.id,a.titles,a.body_key,a.source_url,max(length(u.text)) AS matched_length
        FROM units u JOIN affairs a ON a.id=u.affair_id
        WHERE u.kind='title' AND length(u.text)>=12
        AND contains(lower(?),lower(trim(u.text)))
        GROUP BY a.id,a.titles,a.body_key,a.source_url ORDER BY matched_length DESC,a.id LIMIT 8""", [text])
    return [item for item in matched if item['matched_length'] == matched[0]['matched_length']] if matched else []


def resolve(sentence, previous):
    direct = anchors(sentence)
    if direct:
        return direct, sentence
    # Only inherit an affair for an actual referential continuation, never for a new story.
    if re.match(r'^(it\b|this (affair|proposal|motion|postulate|interpellation)\b|the (affair|proposal|motion|postulate|interpellation)\b|es\b|sie\b|dies(?:es|e|er)\b|il\b|elle\b|ce(?:tte)?\b|esso\b|essa\b|el\b|ella\b|quest(?:a)?\b|quai\b)', sentence, re.I):
        for earlier in reversed(previous):
            matched = anchors(earlier)
            if matched:
                return matched, earlier + '\n' + sentence
    return [], sentence


def search(sentence, previous, translated_terms=None):
    matched, query = resolve(sentence, previous)
    if matched:
        return {'results': matched, 'anchored': True, 'query': query, 'coverage': retrieval.coverage(), 'semantic_enabled': False}
    keywords = [t[:100] for t in (translated_terms or terms(query)) if t.strip()]
    result = retrieval.search(query, limit=8, terms=keywords or None, whole_words=True)
    return {**result, 'anchored': False, 'query': query}


def hydrate(candidates):
    """Fetch missing texts for a bounded shortlist and keep them in DuckDB."""
    warnings = []
    for candidate in candidates[:3]:
        identifier = candidate['id']
        substantive = db.query("SELECT 1 FROM units WHERE affair_id=? AND kind<>'title' AND length(text)>200 LIMIT 1", [identifier])
        if substantive:
            continue
        try:
            fetch_content(identifier)
            if not db.query("SELECT 1 FROM units WHERE affair_id=? AND kind<>'title' AND length(text)>200 LIMIT 1", [identifier]):
                fetch_content(identifier, docs=True)
        except Exception as error:
            warnings.append(f"Source content for affair {identifier} could not be downloaded ({type(error).__name__}).")
    return warnings


def passages(sentence, keywords, candidates):
    """Use whole short texts; cap each affair so long documents cannot crowd out others."""
    ids = list(dict.fromkeys(item['id'] for item in candidates))
    if not ids:
        return []
    units = db.query("""SELECT u.*,a.titles,a.body_key FROM units u JOIN affairs a ON a.id=u.affair_id
        WHERE u.affair_id IN (SELECT unnest(?::BIGINT[])) AND u.kind<>'title' AND length(u.text)>80
        AND NOT EXISTS (SELECT 1 FROM units t WHERE t.affair_id=u.affair_id AND t.kind='title' AND t.text=u.text)
        ORDER BY u.id""", [ids])
    words = set(terms(sentence + ' ' + ' '.join(keywords)))
    by_affair = defaultdict(list)
    for unit in units:
        for offset in range(0, len(unit['text']), 2800):
            part = unit['text'][max(0, offset - 200):offset + 3000]
            # Whole-word matching avoids English "the" matching German "Themen".
            tokens = set(re.findall(r'[^\W_]+', part.casefold()))
            score = len(words & tokens)
            by_affair[unit['affair_id']].append((score, {
                'unit_id': unit['id'], 'text': part, 'affair_id': unit['affair_id'],
                'source_url': unit['source_url'], 'content_hash': unit['content_hash'],
                'titles': json.loads(unit['titles']), 'body_key': unit['body_key'], 'language': unit['language']}))
    for items in by_affair.values():
        items.sort(key=lambda entry: -entry[0])
    selected = []
    # Retain up to three passages per affair, in retrieval order, round-robin.
    # Even a very long document cannot displace every passage of the named affair.
    for slot in range(3):
        for identifier in ids:
            items = by_affair[identifier]
            if slot < len(items):
                selected.append(items[slot][1])
            if len(selected) == 8:
                return selected
    return selected


def rank_evidence(options, query):
    """Bring cross-language matching quotations to the front of the small model's context."""
    from parliament import embeddings
    from parliament.config import digest, json_text
    active = db.query("SELECT value FROM settings WHERE key='embedding_manifest'")
    if not active or not options:
        return options
    manifest = json.loads(active[0]['value'])
    entries = list(options.items())
    key = 'news-quote-vectors:' + digest([manifest['pipeline'], [item['quote'] for _, item in entries]])
    cached = db.query('SELECT value FROM settings WHERE key=?', [key])
    model, _, _ = embeddings.load_model(manifest['revision'])
    if cached:
        vectors = json.loads(cached[0]['value'])
    else:
        vectors = embeddings.encode(model, ['passage: ' + item['quote'] for _, item in entries]).tolist()
        db.execute('INSERT OR REPLACE INTO settings VALUES (?,?)', [key, json_text(vectors)])
    vector = embeddings.encode(model, ['query: ' + query])[0]
    ranked = sorted(zip(entries, vectors), key=lambda pair: -sum(float(a)*b for a,b in zip(vector, pair[1])))
    return dict(item for item, _ in ranked[:12])
