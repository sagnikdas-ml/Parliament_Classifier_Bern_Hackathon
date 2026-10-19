import json
import os
import re
from pathlib import Path
from html.parser import HTMLParser
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from api import app
from parliament import classifier, db, retrieval
from parliament import query_workflow
from parliament.research import export_brief, plain, source_link
import test_pipeline


class ResearchTests(unittest.TestCase):
    setUp = test_pipeline.PipelineTests.setUp
    valid_decision = test_pipeline.PipelineTests.valid_decision
    mock_call = test_pipeline.PipelineTests.mock_call

    def query_plan(self):
        return query_workflow.QueryPlan(name="Digital government", definition="Include digital public administration. Exclude incidental IT references.",
            date_from="2024-01-01", date_to="2024-01-31", body_key=None, language=None,
            keywords_de=["digitale Verwaltung"], keywords_fr=["administration numérique"], keywords_it=["amministrazione digitale"])

    def test_natural_question_resolves_dates_and_query_specific_topic(self):
        with patch.object(classifier, "call_json", return_value=(self.query_plan(), {})):
            plan = query_workflow.plan_query("Find digital government proposals in January 2024")
        self.assertEqual(plan["date_from"], "2024-01-01")
        self.assertTrue(plan["topic_id"].startswith("query:"))
        self.assertEqual(classifier.topic_context(plan["topic_id"])[0][0]["definition"], self.query_plan().definition)
        self.assertEqual(query_workflow.resolve_dates(self.query_plan(), "2023-01-01", "2023-01-02")[0].isoformat(), "2023-01-01")
        with self.assertRaises(ValueError):
            query_workflow.resolve_dates(self.query_plan(), "2025-01-01", "2023-01-01")
        missing = self.query_plan().model_copy(update={"date_from": None})
        with self.assertRaises(ValueError):
            query_workflow.resolve_dates(missing)

    def test_live_candidates_are_date_checked_even_if_api_ignores_filters(self):
        plan = {"keywords":{"de":["Digital"]}, "date_from":"2024-01-01", "date_to":"2024-01-31", "body":None}
        payload = {"data":[{**self.affair,"id":2,"begin_date":"2025-01-01"},
                           {**self.affair,"id":3,"begin_date":None},
                           {**self.affair,"id":4,"begin_date":"2024-01-31T23:59:00"}]}
        with patch.object(query_workflow, "get_json", return_value=payload):
            result = query_workflow.sync_candidates(plan)
        self.assertEqual(result["updated_affairs"], 1)
        self.assertFalse(db.query("SELECT id FROM affairs WHERE id IN (2,3)"))
        self.assertEqual(db.query("SELECT id FROM affairs WHERE id=4")[0]["id"], 4)

    def test_research_ranks_ten_before_classification(self):
        with patch.object(classifier, "call_json", return_value=(self.query_plan(), {})), patch.object(retrieval, "search", return_value={"results":[]}) as search, patch.object(classifier, "classify") as classify:
            result = query_workflow.find("Find digital government in January 2024", live=False, semantic=False)
        self.assertEqual(search.call_args.kwargs["limit"], 10)
        self.assertEqual(search.call_args.kwargs["date_to"], "2024-01-31")
        self.assertIn("administration numérique", search.call_args.kwargs["terms"])
        classify.assert_not_called()
        self.assertEqual(result["results"], [])

    def test_english_translation_keeps_originals_and_is_cached(self):
        with patch.object(classifier, "call_json", side_effect=self.mock_call):
            prediction = classifier.classify(1, self.topic, "de", fetch=False)
        affair = db.query("SELECT * FROM affairs WHERE id=1")[0]
        translation = query_workflow.EnglishTranslation(title_english="Digital administration", passages=[query_workflow.EnglishPassage(source_id="0", english="Public administration should improve its digital services.")])
        with patch.object(classifier, "call_json", return_value=(translation, {})) as call:
            result = query_workflow.translate(affair, prediction)
            again = query_workflow.translate(affair, prediction)
        self.assertEqual(call.call_count, 1)
        self.assertEqual(result, again)
        self.assertEqual(result["title_original"], "Digitale Verwaltung")
        self.assertEqual(result["passages"][0]["original"], prediction["labels"][0]["evidence"]["quote"])
        self.assertTrue(result["machine_translated"])
        self.assertEqual(db.query("SELECT text FROM units WHERE id='text:1:10:de'")[0]["text"], self.source.strip())

    def test_analysis_rejects_out_of_range_without_paid_calls(self):
        from datetime import date
        with patch.object(classifier, "classify") as classify:
            with self.assertRaises(ValueError):
                query_workflow.analyse(1, self.topic, date(2025,1,1), date(2025,1,31))
        classify.assert_not_called()

    def test_translation_failure_does_not_discard_classification(self):
        from datetime import date
        with patch.object(classifier, "classify", return_value={"status":"relevant"}), patch.object(query_workflow, "translate", side_effect=ValueError("invalid translation")):
            result = query_workflow.analyse(1, self.topic, date(2024,1,1), date(2024,1,31))
        self.assertEqual(result["classification"]["status"], "relevant")
        self.assertIsNone(result["translation"])
        self.assertIn("Original text", result["translation_error"])

    def test_compact_workspace_preserves_control_contract(self):
        root = Path(__file__).resolve().parent.parent
        markup = (root / "web/public/index.html").read_text()
        script = (root / "web/public/assets/focus.js").read_text()
        identifiers = []

        class Controls(HTMLParser):
            def handle_starttag(self, tag, attrs):
                identifiers.extend(value for key, value in attrs if key == "id")

        Controls().feed(markup)
        self.assertEqual(len(identifiers), len(set(identifiers)))
        self.assertTrue(set(re.findall(r'byId\("([^" ]+)"\)', script)).issubset(set(identifiers)))
        self.assertIn('<form id="searchForm">', markup)
        self.assertIn('event.preventDefault()', script)
        self.assertIn('<th scope="col">Model result</th>', script)
        self.assertNotIn('class="intro"', markup)
        self.assertIn('Source: OpenParlData.ch', markup)

    def test_research_filters_apply_before_ranking(self):
        self.assertEqual(len(retrieval.search("Verwaltung", semantic=False, language="fr", date_from="2024-01-01", date_to="2024-01-01")["results"]), 1)
        for arguments in ({"language": "it"}, {"date_from": "2025-01-01"}, {"date_to": "2023-12-31"}, {"body": "BS"}):
            self.assertEqual(retrieval.search("Verwaltung", semantic=False, **arguments)["results"], [])

    def test_evidence_export_and_stale_exclusion(self):
        with patch.object(classifier, "call_json", side_effect=self.mock_call):
            classifier.classify(1, self.topic, "de", fetch=False)
        report = export_brief("Research <script>", [1, 1], self.topic)
        self.assertEqual(report.count("## 1:"), 1)
        self.assertIn("https://example.org/source", report)
        self.assertIn("Die öffentliche Verwaltung", report)
        self.assertNotIn("<script>", report)
        classifier.save_topic("Updated", "Changed reporting scope and inclusion criteria.", topic_id=self.topic)
        stale = export_brief("Research", [1], self.topic)
        self.assertIn("no current classification", stale)
        self.assertNotIn("### Suggested topic", stale)

    def test_export_rejects_unavailable_and_unsafe_links(self):
        with self.assertRaises(ValueError):
            export_brief("Research", [999], self.topic)
        self.assertEqual(source_link("javascript:alert(1)"), "Source link unavailable")
        self.assertNotIn("<img", plain('<img src="x">'))

    def test_backend_auth_and_cross_origin(self):
        client = TestClient(app)
        with patch.dict(os.environ, {"PARL_BACKEND_TOKEN": "test-secret"}):
            self.assertEqual(client.get("/api/status").status_code, 401)
            self.assertEqual(client.get("/api/status", headers={"Authorization": "Bearer test-secret"}).status_code, 200)
        self.assertEqual(client.post("/api/brief", headers={"origin": "https://evil.example"}, json={"affair_ids": [1]}).status_code, 403)

    def test_workspace_api_contract(self):
        client = TestClient(app)
        root = Path(__file__).resolve().parent.parent
        built = root / "web/public/calm/index.html"
        expected = built if built.exists() else root / "web/public/index.html"
        self.assertEqual(client.get("/").text, expected.read_text())
        self.assertIn("VectorZero", client.get("/legacy").text)
        self.assertEqual(client.get("/assets/app.js").status_code, 200)
        self.assertEqual(client.get("/admin").status_code, 200)
        self.assertEqual(client.get("/api/bodies").json()[0]["body_key"], "CHE")
        self.assertEqual(client.get("/api/search", params={"q":"text", "date_from":"2025-02-01", "date_to":"2024-01-01"}).status_code, 400)
        self.assertEqual(client.get("/api/search", params={"q":"text", "date_from":"not-a-date"}).status_code, 422)
        self.assertEqual(client.post("/api/brief", json={"affair_ids": []}).status_code, 422)
        response = client.post("/api/brief", json={"affair_ids":[1], "topic_id":self.topic})
        self.assertEqual(response.status_code, 200)
        self.assertIn("text/markdown", response.headers["content-type"])
        with patch.object(query_workflow, "find", side_effect=lambda *args, **kwargs: classifier.model_name()):
            selected_model = client.post("/api/research/search", json={"question":"Find public administration policy", "model":"apertus-v1-5-8b"})
        self.assertEqual(selected_model.json(), "apertus-v1-5-8b")
        self.assertEqual(client.post("/api/research/search", json={"question":"Find public administration policy", "model":"apertus-v1-5-8b-thinking"}).status_code, 422)
        with patch.object(classifier, "call_json", side_effect=self.mock_call):
            classifier.classify(1, self.topic, "de", fetch=False)
        self.assertTrue(client.get("/api/affairs/1").json()["classifications"][0]["current"])
        with patch.object(classifier, "call_json", side_effect=self.mock_call):
            result = classifier.classify(1, self.topic, "de", fetch=False, model="apertus-v1-5-8b")
        self.assertEqual(result["model"], "apertus-v1-5-8b")
        self.assertTrue(client.get("/api/affairs/1", params={"model":"apertus-v1-5-8b"}).json()["classifications"][0]["current"])
        self.assertEqual(client.get("/api/classifications", params={"topic_id":self.topic, "model":"apertus-v1-5-8b"}).json()["results"][0]["model"], "apertus-v1-5-8b")
        with patch.object(classifier, "classify", return_value={"model":"apertus-v1-5-8b"}) as classify_model:
            result = client.post("/api/affairs/1/classify", json={"topic_id":self.topic, "language":"de", "model":"apertus-v1-5-8b"})
        self.assertEqual(result.json()["model"], "apertus-v1-5-8b")
        classify_model.assert_called_once_with(1, self.topic, "de", model="apertus-v1-5-8b")

    def test_fixed_scope_cannot_be_edited_through_api(self):
        from parliament.digitalisation import TOPIC_ID, ensure_topic
        ensure_topic()
        client = TestClient(app)
        self.assertEqual(client.get("/api/digitalisation").json()["id"], TOPIC_ID)
        self.assertEqual(client.put("/api/topics/" + TOPIC_ID, json={"name": "changed", "definition": "A changed benchmark scope."}).status_code, 400)

    def test_positive_benchmark_never_invents_precision_or_negatives(self):
        from parliament.digital_benchmark import summarize
        manifest = {"manifest_hash":"test", "model":"test", "prompt_version":"test", "definition":"test",
                    "cohort":[{"affair_id":1,"language":"de","title":"Digitalisierung","reference":"dvs","expected":"relevant"},
                              {"affair_id":2,"language":"fr","title":"Administration","reference":"politmonitor","expected":"relevant"}]}
        partial = summarize(manifest, {"1":{"status":"relevant"}})
        self.assertIsNone(partial["groups"]["all"]["recall_of_known_positives"])
        complete = summarize(manifest, {"1":{"status":"relevant"}, "2":{"status":"insufficient_evidence"}})
        self.assertEqual(complete["groups"]["all"]["recall_of_known_positives"], 0.5)
        self.assertIsNone(complete["groups"]["all"]["precision"])
        self.assertIsNone(complete["groups"]["all"]["f1"])
        self.assertEqual(complete["groups"]["all"]["completed"], 2)


if __name__ == "__main__":
    unittest.main()
