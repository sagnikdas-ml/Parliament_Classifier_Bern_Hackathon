"""Source attribution from structured archive records; never invent a speaker or date."""
import json
from parliament import db
from parliament.config import API, json_text
from parliament.download import get_json


def label(value):
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        return next((value[k] for k in ('en', 'de', 'fr', 'it', 'rm') if value.get(k)), '')
    return ''


def load(affair_id):
    record = db.query('SELECT * FROM affairs WHERE id=?', [affair_id])[0]
    raw = json.loads(record['raw'])
    result = {'affair_id': affair_id, 'number': raw.get('number'), 'authors': [], 'events': [],
              'record_start_date': str(record['begin_date'])[:10] if record['begin_date'] else None,
              'original_url': next((raw.get('url_external_' + lang) for lang in ('de','fr','it','rm') if raw.get('url_external_' + lang)), record['source_url']),
              'attribution_note': 'Authors are associated with the affair; this does not identify the speaker of every quoted passage.',
              'warnings': []}
    cache = db.query("SELECT value FROM settings WHERE key=?", [f'provenance:v1:{affair_id}'])
    if cache:
        payloads = json.loads(cache[0]['value'])
    else:
        payloads = {}
        for relation in ('contributors', 'events'):
            try:
                payloads[relation] = get_json(f'{API}/affairs/{affair_id}/{relation}?limit=100', timeout=10)
            except Exception as error:
                result['warnings'].append(f'{relation.capitalize()} unavailable ({type(error).__name__}).')
        if len(payloads) == 2:
            db.execute('INSERT OR REPLACE INTO settings VALUES (?,?)', [f'provenance:v1:{affair_id}', json_text(payloads)])
    for relation, payload in payloads.items():
        rows = payload if isinstance(payload, list) else payload.get('data', [])
        if not isinstance(payload, list) and payload.get('meta', {}).get('has_more'):
            result['warnings'].append(f'{relation.capitalize()} limited to first 100 records.')
        for item in rows:
            source_url = f'{API}/affairs/{affair_id}/{relation}'
            if relation == 'contributors':
                role = label(item.get('role_harmonized')) or label(item.get('role'))
                # Co-signatories and handling councils are not the author/speaker.
                if item.get('role_external_id') == 'author' or role.casefold() in ('author', 'auteur', 'autore', 'urheber/in'):
                    name = item.get('fullname') or ' '.join(str(item.get(k) or '') for k in ('firstname', 'lastname')).strip()
                    if name:
                        result['authors'].append({'name': name, 'role': role or 'Author', 'source_url': source_url})
            elif item.get('date'):
                result['events'].append({'date': str(item['date'])[:10], 'label': label(item.get('title_harmonized')) or label(item.get('title')) or 'Recorded event',
                                         'actor': label(item.get('actor')), 'source_url': source_url})
    return result
