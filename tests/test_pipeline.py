import json
import tempfile
import unittest
import os
import subprocess
from types import SimpleNamespace
from pathlib import Path
from unittest.mock import patch

import numpy as np
import pyarrow as pa
import pyarrow.parquet as pq

from parliament import classifier, db, embeddings, evaluation, ingest, jobs, retrieval, judge
from parliament.config import EMBED_VERSION, MODEL, digest, json_text


class PipelineTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.directory = Path(self.temporary.name)
        for module in (db, embeddings, classifier, ingest, evaluation):
            if hasattr(module, "DATA"):
                patcher = patch.object(module, "DATA", self.directory)
                patcher.start()
                self.addCleanup(patcher.stop)
        jobs.STOP.clear()
        self.topic = classifier.save_topic("Digitalisation", "Include digital government. Exclude paper-only administration.")["id"]
        self.affair = {"id": 1, "body_key": "CHE", "begin_date": "2024-01-01", "title_de": "Digitale Verwaltung", "title_fr": "Administration numérique"}
        self.source = "Die öffentliche Verwaltung soll ihre digitalen Dienstleistungen verbessern. " * 5
        affair, units = ingest.affair_record(self.affair)
        units.append(ingest.unit(1, "text:1:10:de", "de", "text", self.source, "https://example.org/source"))
        with db.connect() as connection:
            ingest.upsert(connection, "affairs", [affair])
            ingest.upsert(connection, "units", units)

    def valid_decision(self):
        return classifier.Decision(status="relevant", labels=[classifier.Label(topic_id=self.topic, evidence=classifier.Evidence(unit_id="text:1:10:de", quote="Die öffentliche Verwaltung soll ihre digitalen Dienstleistungen verbessern."))], explanation="Digital public services.")

    def test_run_topic_ranking_counts_distinct_completed_affairs(self):
        def result(*topics, status="relevant"):
            return json_text({"status": status, "labels": [{"topic_id": topic, "name": topic} for topic in topics]})

        rows = [
            ("run", 1, "de", "done", result("Health", "Education", "Health")),
            ("run", 1, "fr", "done", result("Health")),
            ("run", 2, "de", "done", result("Health")),
            ("run", 3, "de", "failed", result("Education")),
            ("other", 4, "de", "done", result("Education")),
            ("run", 5, "de", "done", result("Education", status="insufficient_evidence")),
            ("run", 6, "de", "done", result()),
        ]
        with db.connect() as connection:
            connection.executemany("INSERT INTO job_items (job_id,affair_id,language,status,result) VALUES (?,?,?,?,?)", rows)
        self.assertEqual(jobs.topic_distribution("run"), [
            {"topic_id": "Health", "name": "Health", "count": 2},
            {"topic_id": "Education", "name": "Education", "count": 1},
        ])
        self.assertEqual(jobs.topic_distribution("empty"), [])
        graph = jobs.topic_relationships("run", jobs.topic_distribution("run"))
        self.assertEqual(graph["edges"], [{"source": "Education", "target": "Health", "weight": 1}])

    def test_live_run_metrics_require_compatible_frozen_reviews(self):
        self.assertIsNone(evaluation.live_run_report("empty", self.topic)["scores"])
        def prediction(labels, content="v1"):
            return json_text({"labels": [{"topic_id": label} for label in labels],
                              "language": "de", "status": "relevant" if labels else "not_relevant",
                              "content_hash": content, "topic_version": "topics-v1"})
        with db.connect() as connection:
            for affair, gold, predicted, content in [(1, ["A", "B"], ["A", "C"], "v1"), (2, [], [], "v1"), (3, ["A"], ["A"], "old")]:
                connection.execute("INSERT INTO job_items (job_id,affair_id,language,status,result) VALUES ('quality',?,'auto','done',?)", [affair, prediction(predicted)])
                connection.execute("INSERT INTO reviews (affair_id,topic_id,language,labels,frozen,prediction) VALUES (?,?,'de',?,true,?)", [affair, self.topic, json_text(gold), prediction(gold, content)])
        quality = evaluation.live_run_report("quality", self.topic)
        self.assertEqual(quality["reviewed"], 2)
        self.assertEqual(quality["excluded_reviews"], 1)
        for metric in ("exact_match", "micro_precision", "micro_recall", "micro_f1"):
            self.assertEqual(quality["scores"][metric], .5)
        self.assertEqual(quality["completed"], 3)
        db.execute("UPDATE reviews SET frozen=false")
        self.assertIsNone(evaluation.live_run_report("quality", self.topic)["scores"])

    def test_llm_judge_is_blind_validated_and_persistent(self):
        with patch.object(classifier, "call_json", side_effect=self.mock_call):
            prediction = classifier.classify(1, self.topic, "de", fetch=False)
        run = jobs.create_job("classify", self.topic, 1, [{"affair_id": 1}])
        db.execute("UPDATE job_items SET status='done',result=? WHERE job_id=?", [json_text(prediction), run["id"]])
        with patch.object(classifier, "call_json", side_effect=self.mock_call) as inference:
            self.assertTrue(judge.run_one())
        payload = inference.call_args.args[1]
        self.assertNotIn("prediction", payload)
        self.assertNotIn("labels", payload)
        self.assertEqual(inference.call_args.kwargs["model"], "apertus-v1-5-70b")
        self.assertFalse(judge.run_one())
        report = judge.report(run["id"])
        self.assertEqual(report["reviewed"], 1)
        self.assertEqual(report["scores"]["exact_match"], 1)
        self.assertEqual(report["scores"]["micro_f1"], 1)
        # A rerun invalidates the saved judgment before replacing its snapshot.
        prediction["labels"] = []
        db.execute("DELETE FROM llm_judgments WHERE job_id=?", [run["id"]])
        db.execute("UPDATE job_items SET result=? WHERE job_id=?", [json_text(prediction), run["id"]])
        self.assertIsNone(judge.report(run["id"])["scores"])
        with patch.object(classifier, "call_json", side_effect=self.mock_call):
            self.assertTrue(judge.run_one())
        report = judge.report(run["id"])
        self.assertEqual(report["false_negative"], 1)
        self.assertEqual(report["scores"]["exact_match"], 0)
        self.assertIsNone(report["scores"]["micro_precision"])

    def test_llm_judge_abstains_and_rejects_invented_evidence(self):
        with patch.object(classifier, "call_json", side_effect=self.mock_call):
            prediction = classifier.classify(1, self.topic, "de", fetch=False)
        bad = self.valid_decision()
        bad.labels[0].evidence.quote = "This is an invented quotation that does not exist."
        with patch.object(classifier, "call_json", return_value=(bad, {})):
            with self.assertRaises(ValueError):
                judge.assess(prediction)
        abstention = classifier.Decision(status="insufficient_evidence", labels=[], explanation="Cannot assess.")
        with patch.object(classifier, "call_json", return_value=(abstention, {})):
            self.assertEqual(judge.assess(prediction)["status"], "unjudgeable")
        prediction["content_hash"] = "old"
        with patch.object(classifier, "call_json") as inference:
            self.assertEqual(judge.assess(prediction)["status"], "unjudgeable")
            inference.assert_not_called()

    def mock_call(self, *args, **kwargs):
        return self.valid_decision(), {"calls": 1, "prompt_tokens": 10, "completion_tokens": 5}

    def test_html_and_translations(self):
        self.assertEqual(ingest.clean("<p>A &amp; B</p><p>Überblick</p>"), "A & B Überblick")
        self.assertEqual(ingest.translations({"text_fr": "<p>Texte</p>"}, "text"), {"fr": "Texte"})

    def test_affair_import_is_idempotent_and_replaces_removed_title(self):
        source = self.directory / "affairs.jsonl"
        source.write_text(json_text(self.affair) + "\n")
        ingest.import_affairs(source)
        ingest.import_affairs(source)
        self.assertEqual(db.query("SELECT count(*) AS total FROM affairs")[0]["total"], 1)
        updated = {**self.affair, "title_fr": None}
        source.write_text(json_text(updated) + "\n")
        ingest.import_affairs(source)
        self.assertFalse(db.query("SELECT id FROM units WHERE language='fr'"))

    def test_evidence_rejects_unknown_topic_and_invented_quote(self):
        chunk = [{"unit_id": "text:1:10:de", "kind": "text", "text": self.source}]
        decision = self.valid_decision()
        classifier.validate_decision(decision, chunk, {self.topic})
        with self.assertRaises(ValueError):
            classifier.validate_decision(decision, chunk, {"unknown"})
        decision.labels[0].evidence.quote = "This quotation does not exist in the source."
        with self.assertRaises(ValueError):
            classifier.validate_decision(decision, chunk, {self.topic})

    def test_title_cannot_be_evidence(self):
        decision = self.valid_decision()
        with self.assertRaises(ValueError):
            classifier.validate_decision(decision, [{"unit_id": "text:1:10:de", "kind": "title", "text": self.source}], {self.topic})

    def test_real_quote_is_linked_to_its_actual_source(self):
        decision = self.valid_decision()
        decision.labels[0].evidence.unit_id = "wrong-source"
        classifier.validate_decision(decision, [{"unit_id": "actual-source", "kind": "text", "text": self.source}], {self.topic})
        self.assertEqual(decision.labels[0].evidence.unit_id, "actual-source")

    def test_schema_constrained_inference_maps_named_choices_to_ids(self):
        payload = {"topics": [{"id": self.topic, "name": "Digitalisation"}], "sources": [{"unit_id": "text:1:10:de", "text": self.source}]}
        answer = self.valid_decision().model_dump()
        answer["labels"][0]["topic_id"] = "Digitalisation [" + self.topic + "]"
        response = SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=json_text(answer)), finish_reason="stop")], usage=SimpleNamespace(prompt_tokens=10, completion_tokens=20))
        with patch.dict(os.environ, {"KEERA_API_KEY": "test-only"}), patch.object(classifier, "OpenAI") as client:
            create = client.return_value.__enter__.return_value.chat.completions.create
            create.return_value = response
            result, usage = classifier.call_json("Classify", payload, classifier.Decision)
            self.assertEqual(result.labels[0].topic_id, self.topic)
            self.assertEqual(create.call_args.kwargs["response_format"]["type"], "json_schema")
            self.assertEqual(usage["calls"], 1)

    def test_slurm_wrapper_creates_logs_before_submission(self):
        input_file = self.directory / "units.jsonl"
        input_file.write_text("{}\n")
        fake = self.directory / "sbatch"
        fake.write_text('#!/bin/bash\nset -eu\ntest -d "$REPO_ROOT/logs"\nprintf "%s\\n" "$@"\n')
        fake.chmod(0o755)
        environment = {**os.environ, "PATH": str(self.directory) + os.pathsep + os.environ["PATH"],
                       "REPO_ROOT": str(self.directory), "INPUT_PATH": str(input_file),
                       "EMBED_REVISION": "test-commit", "EMBED_SHARDS": "2"}
        script = Path(__file__).resolve().parent.parent / "scripts" / "submit_embeddings.sh"
        completed = subprocess.run(["bash", str(script), "--time=01:00:00"], env=environment, text=True, capture_output=True, check=True)
        self.assertIn("--array=0-1", completed.stdout)
        self.assertIn("--time=01:00:00", completed.stdout)

    def test_api_validation_and_current_results(self):
        from fastapi.testclient import TestClient
        from api import app
        client = TestClient(app)
        self.assertEqual(client.post("/api/jobs", json={"limit": 500001}).status_code, 422)
        estimate = client.get("/api/jobs/estimate", params={"model":"apertus-v1-5-8b", "topic_id":self.topic})
        self.assertEqual(estimate.status_code, 200)
        self.assertEqual(estimate.json()["model"], "apertus-v1-5-8b")
        self.assertEqual(estimate.json()["sample_size"], 0)
        self.assertEqual(client.get("/api/status").json()["affairs"], 1)
        self.assertEqual(client.get("/api/search", params={"q": "Verwaltung", "semantic": False}).status_code, 200)
        with patch.object(classifier, "call_json", side_effect=self.mock_call):
            prediction = classifier.classify(1, self.topic, "de", fetch=False)
        response = client.get("/api/classifications", params={"topic_id": self.topic, "label_id": self.topic})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["results"][0]["affair_id"], 1)
        self.assertTrue(classifier.result_is_current(prediction))
        classifier.save_topic("Updated", "Changed policy topic definition.", topic_id=self.topic)
        self.assertFalse(classifier.result_is_current(prediction))

    def test_cache_invalidates_when_definition_or_content_changes(self):
        with patch.object(classifier, "call_json", side_effect=self.mock_call) as inference:
            first = classifier.classify(1, self.topic, "de", fetch=False)
            second = classifier.classify(1, self.topic, "de", fetch=False)
            self.assertFalse(first["cached"])
            self.assertTrue(second["cached"])
            self.assertEqual(inference.call_count, 1)
            classifier.save_topic("Digitalisation", "Include public digital services only.", topic_id=self.topic)
            classifier.classify(1, self.topic, "de", fetch=False)
            changed = self.source + " Updated source."
            db.execute("UPDATE units SET text=?,content_hash=? WHERE id='text:1:10:de'", [changed, digest(changed)])
            classifier.classify(1, self.topic, "de", fetch=False)
            self.assertEqual(inference.call_count, 3)

    def test_missing_substantive_text_abstains_without_api_call(self):
        with patch.object(classifier, "call_json") as inference:
            result = classifier.classify(1, self.topic, "fr", fetch=False)
        self.assertEqual(result["status"], "insufficient_evidence")
        inference.assert_not_called()

    def test_truncated_content_cannot_produce_definitive_negative(self):
        long_text = self.source * 200
        db.execute("UPDATE units SET text=?,content_hash=? WHERE id='text:1:10:de'", [long_text, digest(long_text)])
        negative = classifier.Decision(status="not_relevant", labels=[], explanation="No match in this excerpt")
        with patch.object(classifier, "call_json", return_value=(negative, {"calls": 1, "prompt_tokens": 1, "completion_tokens": 1})):
            result = classifier.classify(1, self.topic, "de", fetch=False)
        self.assertTrue(result["partial_content"])
        self.assertEqual(result["status"], "insufficient_evidence")

    def test_frozen_review_retains_prediction_and_cannot_be_overwritten(self):
        with patch.object(classifier, "call_json", side_effect=self.mock_call):
            classifier.classify(1, self.topic, "de", fetch=False)
        classifier.review(1, self.topic, "de", [self.topic], True, True, "Reviewed")
        with self.assertRaises(ValueError):
            classifier.review(1, self.topic, "de", [], False, False, "Overwrite")
        result = evaluation.report(self.topic)
        self.assertEqual(result["frozen_review_metrics"]["micro_f1"], 1)

    def test_job_limit_and_failure_resumption(self):
        job = jobs.create_job("classify", self.topic, 1, [{"affair_id": 1}, {"affair_id": 2}])
        self.assertEqual(job["total"], 1)
        with patch.object(jobs, "classify", side_effect=RuntimeError("temporary API failure")):
            failed = jobs.run_job(job["id"])
        self.assertEqual(failed["status"], "completed_with_errors")
        jobs.control_job(job["id"], "resume")
        with patch.object(jobs, "classify", return_value={"status": "relevant"}):
            resumed = jobs.run_job(job["id"])
        self.assertEqual(resumed["status"], "completed")
        timing = db.query("SELECT started_at,finished_at,elapsed_seconds FROM jobs WHERE id=?", [job["id"]])[0]
        self.assertIsNotNone(timing["started_at"])
        self.assertIsNotNone(timing["finished_at"])
        self.assertGreaterEqual(timing["elapsed_seconds"], 0)
        timing = db.query("SELECT started_at,finished_at,elapsed_seconds FROM jobs WHERE id=?", [job["id"]])[0]
        self.assertIsNotNone(timing["started_at"])
        self.assertIsNotNone(timing["finished_at"])
        self.assertGreaterEqual(timing["elapsed_seconds"], 0)

    def test_cancelled_job_does_not_start(self):
        job = jobs.create_job("classify", self.topic, 1, [{"affair_id": 1}])
        jobs.control_job(job["id"], "cancel")
        with patch.object(jobs, "classify") as inference:
            jobs.run_job(job["id"])
        inference.assert_not_called()

    def test_full_corpus_job_uses_duckdb_population_and_pins_model(self):
        job = jobs.create_job("classify", self.topic, 300000, model="apertus-v1-5-8b", full_corpus=True)
        self.assertEqual(job["total"], 1)
        self.assertEqual(job["config"]["model"], "apertus-v1-5-8b")
        self.assertTrue(job["config"]["full_corpus"])
        self.assertEqual(db.query("SELECT count(*) AS count FROM job_items WHERE job_id=?", [job["id"]])[0]["count"], 1)

    def test_continuous_archive_run_is_created_once_and_persisted(self):
        with patch.object(jobs, "topic_context", return_value=([], "aps-test-v1")):
            first = jobs.ensure_continuous_classification()
            second = jobs.ensure_continuous_classification()
        self.assertEqual(first["id"], second["id"])
        self.assertEqual(first["total"], 1)
        self.assertEqual(first["topic_id"], "aps")
        self.assertEqual(first["config"]["model"], "apertus-v1-5-8b")
        self.assertTrue(first["config"]["continuous_archive"])

    def test_definition_change_prevents_job_resumption(self):
        job = jobs.create_job("classify", self.topic, 1, [{"affair_id": 1}])
        jobs.control_job(job["id"], "cancel")
        classifier.save_topic("Digital", "Include revised digital government scope.", topic_id=self.topic)
        with self.assertRaises(ValueError):
            jobs.control_job(job["id"], "resume")

    def embedding_fixture(self):
        directory = self.directory / "vectors"
        directory.mkdir(exist_ok=True)
        revision = "test-revision"
        pipeline = digest([MODEL, revision, EMBED_VERSION])
        manifest = {"model": MODEL, "revision": revision, "preprocessing": EMBED_VERSION, "pipeline": pipeline, "dimension": 384}
        (directory / "manifest.json").write_text(json_text(manifest))
        record = {"id": "embedding-1", "unit_id": "text:1:10:de", "content_hash": digest(ingest.clean(self.source)), "pipeline": pipeline, "model": MODEL, "revision": revision, "passage": self.source, "vector": [1.0] + [0.0] * 383}
        pq.write_table(pa.Table.from_pylist([record]), directory / "part-0000000.parquet")
        return directory, record

    def test_embedding_import_is_idempotent_and_search_ignores_stale_vectors(self):
        directory, record = self.embedding_fixture()
        embeddings.import_embeddings(directory)
        embeddings.import_embeddings(directory)
        self.assertEqual(db.query("SELECT count(*) AS count FROM embeddings")[0]["count"], 1)
        with patch.object(retrieval, "query_vector", return_value=(record["vector"], record["pipeline"])):
            result = retrieval.search("unrelatedquery")
            self.assertEqual(result["results"][0]["id"], 1)
            db.execute("UPDATE units SET content_hash='changed' WHERE id='text:1:10:de'")
            self.assertEqual(retrieval.search("unrelatedquery")["results"], [])

    def test_incompatible_and_invalid_vectors_rejected(self):
        directory, record = self.embedding_fixture()
        embeddings.import_embeddings(directory)
        record["vector"] = [float("nan")] * 384
        pq.write_table(pa.Table.from_pylist([record]), directory / "part-0000000.parquet")
        with self.assertRaises(ValueError):
            embeddings.import_embeddings(directory)

    def test_portable_embedding_checkpoints_resume_without_reencoding(self):
        class Tokenizer:
            def __call__(self, text, **kwargs):
                return {"offset_mapping": [(index, index + 1) for index in range(len(text))]}
        class Model:
            tokenizer = Tokenizer()
        source = self.directory / "input.jsonl"
        embeddings.export_units(source, titles_only=True)
        target = self.directory / "output"
        def vectors(model, texts, batch_size):
            result = np.zeros((len(texts), 384), dtype=np.float32)
            result[:, 0] = 1
            return result
        with patch.object(embeddings, "load_model", return_value=(Model(), "test-revision", "cpu")), patch.object(embeddings, "encode", side_effect=vectors) as encode:
            embeddings.embed_file(source, target)
            calls = encode.call_count
            embeddings.embed_file(source, target)
            self.assertEqual(encode.call_count, calls)
        embeddings.import_embeddings(target)
        self.assertEqual(retrieval.coverage()["with_embeddings"], 1)

    def test_lexical_search_handles_quotes_and_unicode(self):
        self.assertEqual(retrieval.search("Verwaltung'; DROP TABLE affairs;", semantic=False)["results"][0]["id"], 1)
        self.assertEqual(retrieval.coverage()["affairs"], 1)

    def test_metrics_use_sets_and_do_not_invent_negatives(self):
        result = evaluation.metrics([({"a", "b"}, {"a", "c"})])
        self.assertEqual(result["micro_precision"], 0.5)
        self.assertEqual(result["micro_recall"], 0.5)
        self.assertIsNone(evaluation.digitalisation_recall([1])["precision"])


if __name__ == "__main__":
    unittest.main()
