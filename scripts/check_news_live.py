"""Small live regression set, not an accuracy benchmark.
Run: PYTHONPATH=. .venv/bin/python scripts/check_news_live.py
Uses configured Apertus credentials and writes runs to DuckDB.
"""
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from parliament import factcheck, classifier

CASES = [
    ('original_news', 'en', '''The Swiss parliamentary affair "Künstliche Intelligenz als Infrastruktur" asks how the public, businesses, researchers, schools, and public administration could access a competitive, open, and secure AI system.
It also asks what requirements should apply to data centres operating public AI services, including cooling and water consumption.
I had coffee this morning.
My favourite colour is blue.''', ['supported', 'supported', 'apolitical', 'apolitical']),
    ('correction', 'en', '''The parliamentary affair "Stärkung der Eidgenössischen Militärakademie an der ETH Zürich (MILAK)" states that MILAK already has the right to award doctorates and already offers a master's programme.''', ['contradicted']),
    ('unknown_amount', 'en', '''The affair "Stärkung der Eidgenössischen Militärakademie an der ETH Zürich (MILAK)" states that exactly 987 million francs have been approved for its expansion.''', ['unverified']),
    ('german', 'de', '''Das parlamentarische Geschäft «Künstliche Intelligenz als Infrastruktur» fragt nach Anforderungen an Rechenzentren, insbesondere bezüglich Kühlung und Wasserverbrauch.
Ich habe heute Morgen Kaffee getrunken.''', ['supported', 'apolitical']),
    ('french', 'fr', '''L'affaire parlementaire «Künstliche Intelligenz als Infrastruktur» demande quelles exigences devraient s'appliquer aux centres de données exploitant des services publics d'IA, notamment en matière de refroidissement et de consommation d'eau.
J'ai bu un café ce matin.''', ['supported', 'apolitical']),
    ('italian', 'it', '''L'affare parlamentare «Künstliche Intelligenz als Infrastruktur» chiede quali requisiti debbano soddisfare i data center che gestiscono servizi pubblici basati sull'IA, in particolare riguardo al raffreddamento e al consumo idrico.
Ho bevuto un caffè questa mattina.''', ['supported', 'apolitical']),
    ('romansh', 'rm', '''L'affera parlamentara «Künstliche Intelligenz als Infrastruktur» dumonda tge pretensiuns che duain valair per centers da datas che mainan servetschs publics d'intelligenza artifiziala, inclusiv la sfradentada ed il consum d'aua.
Jau hai bavì in café questa damaun.''', ['supported', 'apolitical']),
]


def main():
    report = {'checked_at': datetime.now(timezone.utc).isoformat(), 'model': classifier.model_name(), 'version': factcheck.VERSION, 'cases': [],
              'notice': 'Small regression/smoke set, not an independent accuracy benchmark. No claim of equal accuracy across languages.'}
    selected = [case for case in CASES if not os.getenv('POLINEWS_CASES') or case[0] in os.getenv('POLINEWS_CASES', '').split(',')]
    for name, language, text, expected in selected:
        run = factcheck.create(text, language)
        outcomes = []
        for index, target in enumerate(expected):
            try:
                result = factcheck.check(run['id'], index)
                passed = result['status'] == target
                if target == 'supported':
                    passed = passed and bool(result['topics']) and bool(result['matched_affairs']) and not result['needs_review']
                if target == 'contradicted':
                    passed = passed and bool(result['topics']) and any(c['correction'] and c['correction_evidence'] for c in result['claims'])
                if target == 'apolitical':
                    passed = passed and not result['needs_review']
                outcomes.append({'expected': target, 'passed': passed, 'result': result})
                print(name, index, result['status'], 'PASS' if passed else 'FAIL', flush=True)
            except Exception as error:
                outcomes.append({'expected': target, 'passed': False, 'error': str(error)})
                print(name, index, 'ERROR', str(error), flush=True)
        report['cases'].append({'name': name, 'language': language, 'run_id': run['id'], 'outcomes': outcomes})
        destination = Path('evaluation/news-live-regression.json')
        destination.write_text(json.dumps(report, ensure_ascii=False, indent=2))
    if not all(o['passed'] for c in report['cases'] for o in c['outcomes']):
        raise SystemExit(1)


if __name__ == '__main__':
    main()
