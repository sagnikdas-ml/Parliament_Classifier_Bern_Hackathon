import json
import unittest
import os
from unittest.mock import patch
from fastapi.testclient import TestClient
from api import app
from parliament import classifier, db, factcheck, news_retrieval, provenance, ingest
import test_pipeline


class FactCheckTests(unittest.TestCase):
    setUp = test_pipeline.PipelineTests.setUp

    def test_default_model_is_apertus_70b_tool_call_variant(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(classifier.model_name(), 'apertus-v1-5-70b')

    def scope(self, scope='swiss_parliament'):
        return factcheck.Scope(scope=scope, explanation='Test scope', terms=['Verwaltung'], input_language='en', sentence_english='The administration should improve digital services.')

    def claim(self, verdict='supported', quote=None, correction=None):
        return factcheck.ReferencedAssessment(claims=[factcheck.ReferencedClaim(text='The administration should improve digital services.', verdict=verdict,
            explanation='Test assessment', correction=correction, evidence_ids=['missing' if quote else 'E0'])])

    def run_check(self, assessment=None, review=None, scope=None, force=False, correction_review=None):
        run = factcheck.create('The administration should improve digital services.')
        assessment = assessment or self.claim()
        review = review or factcheck.Review(verdict=assessment.claims[0].verdict, reason='Test review')
        outputs = [(scope or self.scope(), {}), (assessment, {}), (review, {})]
        if assessment.claims[0].verdict == 'contradicted' and review.verdict == 'contradicted':
            if assessment.claims[0].correction:
                outputs.append((correction_review or factcheck.Review(verdict='supported', reason='Correction supported'), {}))
                if correction_review and correction_review.verdict != 'supported':
                    outputs.append((factcheck.Correction(text=None), {}))
            else:
                outputs.append((factcheck.Correction(text=None), {}))
        with patch.object(classifier, 'call_json', side_effect=outputs), patch.object(classifier, 'classify', return_value={'labels': []}), patch.object(provenance, 'load', return_value={}), patch.object(factcheck.retrieval, 'search', return_value={'results':[{'id':1}]}):
            return factcheck.check(run['id'], 0, force)

    def test_split_preserves_all_offsets_and_swiss_dates(self):
        text = 'Dr. Meier cites Art. 5. It costs 2.5 million!\nIl pleut.'
        spans = factcheck.split_sentences(text)
        self.assertEqual(len(spans), 3)
        for span in spans:
            self.assertEqual(span['text'], text[span['start']:span['end']])
        self.assertEqual(spans[0]['text'], 'Dr. Meier cites Art. 5.')
        for invalid in (' ', 'word. '*41, 'a'*2001):
            with self.assertRaises(ValueError): factcheck.create(invalid)

    def test_scope_model_receives_duckdb_retrieval(self):
        run = factcheck.create('The affair "Digitale Verwaltung" asks about digital services.')
        outputs = [(self.scope('apolitical'), {}), (self.claim(), {}), (factcheck.Review(verdict='supported', reason='Evidence supports the claim'), {})]
        with patch.object(classifier, 'call_json', side_effect=outputs) as call, patch.object(factcheck.retrieval, 'search', return_value={'results': [{'id': 1}]}), patch.object(classifier, 'classify', return_value={'labels': []}), patch.object(provenance, 'load', return_value={}):
            result = factcheck.check(run['id'], 0)
        payload = call.call_args_list[0].args[1]
        self.assertEqual(payload['archive_candidates'][0]['id'], 1)
        self.assertEqual(payload['archive_passages'][0]['unit_id'], 'text:1:10:de')
        self.assertFalse(result['needs_review'])

    def test_exact_archived_affair_match_overrides_uncertain_scope(self):
        scope = self.scope('uncertain')
        result = factcheck.enforce_anchored_parliament_scope(scope, {'anchored': True})
        self.assertEqual(result.scope, 'swiss_parliament')
        self.assertIn('matched to an OpenParlData record', result.explanation)

    def test_supported_claim_persists_verified_source(self):
        result = self.run_check()
        self.assertEqual(result['status'], 'supported')
        self.assertEqual(result['claims'][0]['evidence'][0]['source_url'], 'https://example.org/source')
        self.assertEqual(len(db.query('SELECT * FROM fact_check_sentences')), 1)

    def test_invented_quote_cannot_be_false_or_corrected(self):
        result = self.run_check(self.claim('contradicted', 'An invented quotation that does not exist.', 'Made up correction'))
        self.assertEqual(result['status'], 'unverified')
        self.assertIsNone(result['claims'][0]['correction'])
        self.assertEqual(result['claims'][0]['evidence'], [])

    def test_second_review_rejects_wrong_entailment(self):
        result = self.run_check(self.claim('contradicted', correction='Wrong correction'), factcheck.Review(verdict='unverified', reason='Evidence does not establish this verdict'))
        self.assertEqual(result['status'], 'unverified')
        self.assertIsNone(result['claims'][0]['correction'])

    def test_correction_requires_own_review(self):
        result = self.run_check(self.claim('contradicted', correction='Unsupported correction'), correction_review=factcheck.Review(verdict='unverified', reason='Correction not supported'))
        self.assertEqual(result['status'], 'contradicted')
        self.assertIsNone(result['claims'][0]['correction'])
        result = self.run_check(self.claim('contradicted', correction='Supported correction'))
        self.assertEqual(result['claims'][0]['correction'], 'Supported correction')

    def test_no_sources_never_means_false(self):
        run = factcheck.create('The administration should improve digital services.')
        with patch.object(classifier, 'call_json', return_value=(self.scope(), {})) as call, patch.object(factcheck.retrieval, 'search', return_value={'results':[]}):
            result = factcheck.check(run['id'], 0)
        self.assertEqual(call.call_count, 1)
        self.assertEqual(result['status'], 'unverified')

    def test_apolitical_scope_can_be_overridden(self):
        result = self.run_check(scope=self.scope('apolitical'))
        self.assertEqual(result['status'], 'apolitical')
        self.assertEqual(result['claims'], [])
        result = self.run_check(scope=self.scope('apolitical'), force=True)
        self.assertEqual(result['status'], 'supported')

    def test_factual_statement_cannot_be_dismissed_without_review(self):
        result = self.run_check(self.claim('not_factual'), factcheck.Review(verdict='unverified', reason='Evidence does not establish this verdict'))
        self.assertEqual(result['status'], 'unverified')

    def test_mixed_claims_and_uncovered_text_remain_visible(self):
        assessment = self.claim()
        assessment.claims[0].text = 'The administration'
        result = self.run_check(assessment)
        self.assertEqual(result['status'], 'mixed')
        self.assertEqual(result['claims'][0]['verdict'], 'supported')
        self.assertEqual(result['claims'][1]['verdict'], 'unverified')
        self.assertIn('improve digital services', result['claims'][1]['text'])

    def test_wrong_source_and_title_cannot_validate_evidence(self):
        assessment = self.claim('contradicted')
        assessment.claims[0].evidence_ids = ['title:1:de']
        result = self.run_check(assessment)
        self.assertEqual(result['status'], 'unverified')

    def test_api_and_invalid_indices(self):
        client = TestClient(app)
        self.assertEqual(client.post('/api/fact-checks', json={'text':' '}).status_code, 400)
        response = client.post('/api/fact-checks', json={'text':'One. Two.'})
        self.assertEqual(response.status_code, 200)
        run = response.json()
        self.assertEqual(len(run['sentences']), 2)
        self.assertEqual(client.post(f"/api/fact-checks/{run['id']}/sentences/3").status_code, 400)
        self.assertEqual(client.post('/api/fact-checks/unknown/sentences/0').status_code, 400)



    def test_named_affair_and_pronoun_use_same_record(self):
        with patch.object(factcheck.retrieval, 'search') as broad:
            first = news_retrieval.search('The affair "Digitale Verwaltung" asks about services.', [])
            follow = news_retrieval.search('It also asks about schools.', ['The affair "Digitale Verwaltung" asks about services.'])
        self.assertEqual([r['id'] for r in first['results']], [1])
        self.assertEqual([r['id'] for r in follow['results']], [1])
        broad.assert_not_called()
        matched, _ = news_retrieval.resolve('My favourite colour is blue.', ['The affair "Digitale Verwaltung" asks about services.'])
        self.assertEqual(matched, [])

    def test_exact_title_beats_shorter_title(self):
        record, units = ingest.affair_record({**self.affair, 'id': 2, 'title_de': 'Digitale Verwaltung verbessern'})
        with db.connect() as connection:
            ingest.upsert(connection, 'affairs', [record]); ingest.upsert(connection, 'units', units)
        self.assertEqual([r['id'] for r in news_retrieval.anchors('The affair "Digitale Verwaltung verbessern" asks a question.')], [2])

    def test_long_documents_do_not_displace_other_affairs(self):
        record, units = ingest.affair_record({**self.affair, 'id': 2, 'title_de': 'Another topic'})
        units.append(ingest.unit(2, 'long', 'de', 'document', 'digital services ' * 10000, 'https://example.org/long'))
        with db.connect() as connection:
            ingest.upsert(connection, 'affairs', [record]); ingest.upsert(connection, 'units', units)
        selected = news_retrieval.passages('digital services', [], [{'id': 2}, {'id': 1}])
        self.assertIn(1, [p['affair_id'] for p in selected])
        self.assertLessEqual(sum(p['affair_id'] == 2 for p in selected), 3)

    def test_titles_repeated_as_text_cannot_be_evidence(self):
        title = {'unit_id': 'title', 'kind': 'title', 'text': 'Digitale Verwaltung'}
        duplicate = {**title, 'unit_id': 'duplicate', 'kind': 'text'}
        decision = classifier.Decision(status='relevant', labels=[classifier.Label(topic_id=self.topic,
            evidence=classifier.Evidence(unit_id='duplicate', quote='Digitale Verwaltung'))], explanation='Test')
        with self.assertRaises(ValueError): classifier.validate_decision(decision, [title, duplicate], {self.topic})

    def test_source_quotes_are_selected_not_generated(self):
        sources = news_retrieval.passages('digital', [], [{'id': 1}])
        options = factcheck.evidence_options(sources)
        result = factcheck.resolve_assessment(self.claim(), options)
        self.assertEqual(result.claims[0].evidence[0].quote, options['E0']['quote'])
        self.assertIn(result.claims[0].evidence[0].quote, self.source)

    def test_provenance_distinguishes_author_cosigner_and_event_date(self):
        payloads = [ {'data': [
            {'fullname': 'Author Person', 'role_external_id': 'author', 'role_harmonized': {'en': 'Author'}},
            {'fullname': 'Cosigner Person', 'role_external_id': 'cosign'}]},
            {'data': [{'date': '2024-01-02T00:00:00', 'title': {'de': 'Eingereicht'}}]} ]
        with patch.object(provenance, 'get_json', side_effect=payloads) as fetch:
            result = provenance.load(1)
            cached = provenance.load(1)
        self.assertEqual(fetch.call_count, 2)
        self.assertEqual(result, cached)
        self.assertEqual([a['name'] for a in result['authors']], ['Author Person'])
        self.assertEqual(result['record_start_date'], '2024-01-01')
        self.assertEqual(result['events'][0]['date'], '2024-01-02')

    def test_missing_content_is_fetched_and_cached(self):
        db.execute("DELETE FROM units WHERE kind<>'title'")
        with patch.object(news_retrieval, 'fetch_content') as fetch:
            news_retrieval.hydrate([{'id': 1}])
        self.assertEqual(fetch.call_count, 2)

    def test_whole_word_search_avoids_substring_false_matches(self):
        self.assertFalse(factcheck.retrieval.search('alt', terms=['alt'], semantic=False, whole_words=True)['results'])
        self.assertTrue(factcheck.retrieval.search('Verwaltung', terms=['Verwaltung'], semantic=False, whole_words=True)['results'])

    def test_all_five_output_languages_are_saved_and_validated(self):
        client = TestClient(app)
        for language in ('en', 'de', 'fr', 'it', 'rm'):
            response = client.post('/api/fact-checks', json={'text': 'A test sentence.', 'language': language})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()['language'], language)
            self.assertEqual(db.query('SELECT language FROM fact_checks WHERE id=?', [response.json()['id']])[0]['language'], language)
        self.assertEqual(client.post('/api/fact-checks', json={'text': 'Test.', 'language': 'xx'}).status_code, 422)

    def test_news_run_can_select_saved_custom_topics(self):
        client = TestClient(app)
        response = client.post('/api/fact-checks', json={'text': 'A political claim.', 'topic_ids': [self.topic]})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['topic_ids'], [self.topic])
        saved = db.query('SELECT topic_ids FROM fact_checks WHERE id=?', [response.json()['id']])[0]
        self.assertEqual(json.loads(saved['topic_ids']), [self.topic])
        invalid = client.post('/api/fact-checks', json={'text': 'A political claim.', 'topic_ids': ['aps']})
        self.assertEqual(invalid.status_code, 400)

    def test_custom_topics_are_attached_with_their_own_verified_citations(self):
        result = {'claims': [{'verdict': 'supported', 'evidence': [{'affair_id': 1}]}]}
        aps = {'labels': [{'topic_id': 'aps:1', 'name': 'Public administration', 'evidence': {'unit_id': 'text:1:10:de', 'quote': self.source[:70], 'source_url': 'https://example.org/source'}}]}
        custom = {'labels': [{'topic_id': self.topic, 'name': 'Digitalisation', 'evidence': {'unit_id': 'text:1:10:de', 'quote': self.source[:70], 'source_url': 'https://example.org/source'}}]}
        with patch.object(classifier, 'classify', side_effect=[aps, custom]), patch.object(provenance, 'load', return_value={}):
            factcheck.attach_topics(result, [self.topic])
        self.assertEqual([topic['scheme'] for topic in result['topics']], ['APS', 'Custom'])
        self.assertEqual(result['topics'][1]['custom_topic_id'], self.topic)

    def test_supported_claim_requires_archive_reference(self):
        for verdict in ('supported', 'contradicted'):
            claim = factcheck.ReferencedClaim(text='A factual claim.', verdict=verdict, explanation='Test', evidence_ids=[], correction=None)
            result = factcheck.resolve_assessment(factcheck.ReferencedAssessment(claims=[claim]), {})
            self.assertEqual(result.claims[0].verdict, 'unverified')
            self.assertIsNone(result.claims[0].correction)

    def test_topic_shortlist_uses_cached_vectors_and_relevant_ranking(self):
        import numpy as np
        from parliament import embeddings
        catalogue = [{'id': str(i), 'definition': f'Topic {i}'} for i in range(13)]
        db.execute("INSERT INTO settings VALUES ('embedding_manifest', ?)", ['{"pipeline":"test-pipeline","revision":"test-revision"}'])
        vectors = np.array([[0., 1.]] * 12 + [[1., 0.]])
        with patch.object(embeddings, 'load_model', return_value=(object(), 'test-revision', 'cpu')), patch.object(embeddings, 'encode', side_effect=[vectors, np.array([[1., 0.]]), np.array([[1., 0.]])]) as encode:
            selected, _ = classifier.narrow_aps_topics(catalogue, 'Target', [{'text': 'Source'}])
            again, _ = classifier.narrow_aps_topics(catalogue, 'Target', [{'text': 'Source'}])
        self.assertEqual(selected[0]['id'], '12')
        self.assertEqual(len(selected), 12)
        self.assertEqual(again, selected)
        self.assertEqual(encode.call_count, 3)


class EditorialNoticeTests(unittest.TestCase):
    def result(self, scope, verdicts):
        return factcheck.review_notice({'scope': scope, 'claims': [{'verdict': verdict} for verdict in verdicts]})

    def test_uncertain_and_contradicted_political_claims_notify(self):
        for scope in ('swiss_parliament', 'other_political', 'uncertain'):
            for verdict in ('unverified', 'contradicted'):
                result = self.result(scope, [verdict])
                self.assertTrue(result['needs_review'])
                self.assertTrue(result['claims'][0]['needs_review'])
                self.assertIn('Needs review:', result['review_notice'])

    def test_apolitical_never_notifies_even_after_manual_archive_check(self):
        result = self.result('apolitical', ['unverified', 'contradicted'])
        self.assertFalse(result['needs_review'])
        self.assertIsNone(result['review_notice'])
        self.assertTrue(all(not c['needs_review'] for c in result['claims']))

    def test_supported_and_opinion_do_not_notify(self):
        result = self.result('swiss_parliament', ['supported', 'not_factual'])
        self.assertFalse(result['needs_review'])
        self.assertEqual(result['political_status'], 'political')

    def test_mixed_sentence_notifies_only_problem_claim(self):
        result = self.result('swiss_parliament', ['supported', 'unverified'])
        self.assertTrue(result['needs_review'])
        self.assertEqual([c['needs_review'] for c in result['claims']], [False, True])

    def test_uncertain_scope_itself_needs_review(self):
        self.assertTrue(self.result('uncertain', ['supported'])['needs_review'])


if __name__ == "__main__":
    unittest.main()
