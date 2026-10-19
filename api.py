from pathlib import Path
from contextlib import asynccontextmanager
import json
import os
import secrets
from datetime import date
from typing import Literal

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.responses import JSONResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from openai import APIConnectionError, APIStatusError, APITimeoutError

from test_apertus import ask_apertus
from parliament import db
from parliament import classifier, jobs, retrieval, judge
from parliament.config import ROOT
from parliament.evaluation import report, evaluation_sample, live_run_report
from parliament.ingest import ensure_affair
from parliament.polibot import Context as PoliBotContext, ChatRequest as PoliBotChatRequest


@asynccontextmanager
async def lifespan(app):
    from parliament.digitalisation import ensure_topic
    ensure_topic()
    jobs.start_worker()
    judge.start_worker()
    yield
    judge.stop_worker()
    jobs.stop_worker()


app = FastAPI(title="ParlaRadar", lifespan=lifespan)
app.mount("/assets", StaticFiles(directory=ROOT / "web" / "public" / "assets"), name="assets")
calm_dist = ROOT / "web" / "public" / "calm"
if calm_dist.exists():
    app.mount("/calm", StaticFiles(directory=calm_dist, html=True), name="calm-ui")


@app.middleware("http")
async def protect_backend(request, call_next):
    token = os.environ.get("PARL_BACKEND_TOKEN")
    if token and not secrets.compare_digest(request.headers.get("authorization", "").encode(), ("Bearer " + token).encode()):
        return JSONResponse(status_code=401, content={"detail": "Backend authentication required"})
    if request.method not in {"GET", "HEAD", "OPTIONS"}:
        origin = request.headers.get("origin")
        if origin and origin != str(request.base_url).rstrip("/"):
            return JSONResponse(status_code=403, content={"detail": "Cross-origin writes are disabled"})
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["X-Frame-Options"] = "DENY"
    return response


@app.exception_handler(ValueError)
async def invalid_request(request, error):
    from fastapi.responses import JSONResponse
    return JSONResponse(status_code=400, content={"detail": str(error)})


@app.exception_handler(APIStatusError)
async def inference_error(request, error):
    from fastapi.responses import JSONResponse
    return JSONResponse(status_code=502, content={"detail": f"Apertus returned HTTP {error.status_code}."})


@app.exception_handler(APIConnectionError)
async def inference_connection_error(request, error):
    from fastapi.responses import JSONResponse
    return JSONResponse(status_code=502, content={"detail": "Apertus is unavailable; retry or resume the job."})


@app.get("/")
def home():
    if (ROOT / "web" / "public" / "calm" / "index.html").exists():
        return FileResponse(ROOT / "web" / "public" / "calm" / "index.html")
    return FileResponse(ROOT / "web" / "public" / "index.html")


@app.get("/legacy")
def legacy_home():
    """Keep the complete original workstation available while the calm shell is rolled out."""
    return FileResponse(ROOT / "web" / "public" / "index.html")


@app.get("/about")
def about():
    return FileResponse(ROOT / "web" / "public" / "about.html")


@app.get("/admin")
def admin():
    return FileResponse(ROOT / "dashboard.html")


@app.get("/chat-ui")
def chat_ui():
    return FileResponse(ROOT / "chat.html")


class ClassificationRequest(BaseModel):
    topic_id: str = "aps"
    language: str | None = Field(default=None, pattern="^(de|fr|it|rm)$")
    model: Literal["apertus-v1-5-8b", "apertus-v1-5-70b"] = "apertus-v1-5-70b"


class TopicRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    definition: str = Field(min_length=10, max_length=4000)
    keywords: dict[str, list[str]] = Field(default_factory=dict)


class DraftRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class JobRequest(BaseModel):
    topic_id: str = "aps"
    limit: int = Field(default=20, ge=1, le=500000)
    model: Literal["apertus-v1-5-8b", "apertus-v1-5-70b"] = "apertus-v1-5-70b"
    calibration: bool = False
    full_corpus: bool = False
    affair_ids: list[int] | None = Field(default=None, max_length=10000)
    body: str | None = None
    after_id: int | None = Field(default=None, ge=0)


class ReviewRequest(BaseModel):
    topic_id: str = "aps"
    language: str = Field(pattern="^(de|fr|it|rm|und)$")
    model: Literal["apertus-v1-5-8b", "apertus-v1-5-70b"] = "apertus-v1-5-70b"
    labels: list[str]
    relevant: bool
    frozen: bool = False
    notes: str = Field(default="", max_length=4000)


@app.get("/api/status")
def status():
    return retrieval.coverage()


@app.get("/api/topics")
def topics():
    return db.query("SELECT * FROM topics ORDER BY scheme,id")


@app.post("/api/topics/draft")
def draft(request: DraftRequest):
    return classifier.draft_topic(request.name)


@app.post("/api/topics")
def create_topic(request: TopicRequest):
    return classifier.save_topic(request.name, request.definition, request.keywords)


@app.put("/api/topics/{topic_id}")
def edit_topic(topic_id: str, request: TopicRequest):
    if topic_id.startswith("focus:"):
        raise ValueError("The benchmark scope is fixed; create a separate custom topic instead")
    return classifier.save_topic(request.name, request.definition, request.keywords, topic_id)


@app.get("/api/digitalisation")
def digitalisation_scope():
    from parliament.digitalisation import DEFINITION, NAME, TOPIC_ID
    return {"id": TOPIC_ID, "name": NAME, "definition": DEFINITION, "version": 1}


@app.get("/api/digitalisation/benchmark")
def digitalisation_benchmark():
    from parliament.digital_benchmark import published_report
    return published_report()


@app.get("/api/affairs/{affair_id}")
def affair(affair_id: int, model: Literal["apertus-v1-5-8b", "apertus-v1-5-70b"] = "apertus-v1-5-70b"):
    record = ensure_affair(affair_id)
    record["titles"] = json.loads(record["titles"])
    body_rows = db.query("""SELECT b.raw FROM affairs a JOIN bodies b
        ON b.id=json_extract_string(a.raw,'$.body_id') WHERE a.id=? LIMIT 1""", [affair_id])
    if body_rows:
        body = json.loads(body_rows[0]["raw"])
        record["body_key"] = body.get("body_key") or record.get("body_key")
        record["body_name"] = body.get("name_en") or body.get("name_de") or body.get("name")
    record["units"] = db.query("SELECT * FROM units WHERE affair_id=?", [affair_id])
    record["classifications"] = [json.loads(item["result"]) for item in db.query("SELECT result FROM classifications WHERE affair_id=? ORDER BY created_at DESC", [affair_id])]
    with classifier.model_context(model):
        for prediction in record["classifications"]:
            prediction["current"] = classifier.result_is_current(prediction)
    record["reviews"] = db.query("SELECT * EXCLUDE(prediction) FROM reviews WHERE affair_id=?", [affair_id])
    return record


@app.post("/api/affairs/{affair_id}/classify")
def classify(affair_id: int, request: ClassificationRequest):
    return classifier.classify(affair_id, request.topic_id, request.language, model=request.model)


@app.post("/api/affairs/{affair_id}/review")
def review(affair_id: int, request: ReviewRequest):
    with classifier.model_context(request.model):
        return classifier.review(affair_id, **request.model_dump(exclude={"model"}))


@app.get("/api/search")
def search(q: str = Query(default="", max_length=4000), topic_id: str | None = None, limit: int = Query(default=30, ge=1, le=200), body: str | None = None, semantic: bool = True, language: str | None = Query(default=None, pattern="^(de|fr|it|rm)$"), date_from: date | None = None, date_to: date | None = None):
    if date_from and date_to and date_from > date_to:
        raise ValueError("Start date must not be after end date")
    if topic_id and not q.strip():
        catalogue, _ = classifier.topic_context(topic_id)
        item = catalogue[0]
        keywords = json.loads(item["raw"])
        q = item["name"] + " " + " ".join(word for values in keywords.values() if isinstance(values, list) for word in values if isinstance(word, str)) + " " + item["definition"]
    if not q.strip():
        raise ValueError("Enter a query or select a custom topic")
    result = retrieval.search(q, limit, body, semantic, language, date_from, date_to)
    if topic_id:
        for item in result["results"]:
            current = db.query("SELECT result FROM classifications WHERE affair_id=? AND topic_id=? AND topic_version=? ORDER BY created_at DESC LIMIT 1", [item["id"], topic_id, classifier.topic_context(topic_id)[1]])
            saved = json.loads(current[0]["result"]) if current else None
            item["classification"] = saved if saved and classifier.result_is_current(saved) else None
    return result


class BriefRequest(BaseModel):
    title: str = Field(default="Parliamentary research shortlist", max_length=200)
    affair_ids: list[int] = Field(min_length=1, max_length=30)
    topic_id: str = Field(default="aps", max_length=200)


class ResearchSearchRequest(BaseModel):
    question: str = Field(min_length=5, max_length=2000)
    date_from: date | None = None
    date_to: date | None = None
    body: str | None = Field(default=None, max_length=100)
    language: str | None = Field(default=None, pattern="^(de|fr|it|rm)$")
    live: bool = True
    semantic: bool = True
    model: Literal["apertus-v1-5-8b", "apertus-v1-5-70b"] = "apertus-v1-5-70b"


class ResearchAnalyseRequest(BaseModel):
    affair_id: int = Field(gt=0)
    topic_id: str = Field(min_length=1, max_length=200)
    date_from: date
    date_to: date
    language: str | None = Field(default=None, pattern="^(de|fr|it|rm)$")
    model: Literal["apertus-v1-5-8b", "apertus-v1-5-70b"] = "apertus-v1-5-70b"


@app.post("/api/research/search")
def research_search(request: ResearchSearchRequest):
    from parliament.query_workflow import find
    if request.date_from and request.date_to and request.date_from > request.date_to:
        raise ValueError("The start date must not be after the end date.")
    with classifier.model_context(request.model):
        return find(request.question, request.date_from, request.date_to, request.body, request.language, request.live, request.semantic)


@app.post("/api/research/analyse")
def research_analyse(request: ResearchAnalyseRequest):
    from parliament.query_workflow import analyse
    with classifier.model_context(request.model):
        return analyse(request.affair_id, request.topic_id, request.date_from, request.date_to, request.language)


@app.post("/api/brief")
def brief(request: BriefRequest):
    from parliament.research import export_brief
    return PlainTextResponse(export_brief(request.title, request.affair_ids, request.topic_id),
                             media_type="text/markdown", headers={"Content-Disposition": 'attachment; filename="research-brief.md"'})


@app.get("/api/bodies")
def bodies():
    return db.query("SELECT body_key, count(*) AS affairs FROM affairs GROUP BY body_key ORDER BY body_key")


@app.get("/api/classifications")
def classifications(topic_id: str = "aps", label_id: str | None = None, limit: int = Query(default=50, ge=1, le=200), after_id: int = Query(default=0, ge=0), model: Literal["apertus-v1-5-8b", "apertus-v1-5-70b"] = "apertus-v1-5-70b", include_stale: bool = False):
    version = classifier.topic_context(topic_id)[1]
    from parliament.config import PROMPT_VERSION
    records = db.query("""SELECT result FROM classifications c
        WHERE topic_id=? AND topic_version=? AND model=? AND (? OR prompt_version=?) AND affair_id>?
        AND (? IS NULL OR EXISTS (SELECT 1 FROM json_each(c.result, '$.labels') label
          WHERE json_extract_string(label.value,'$.topic_id')=?))
        QUALIFY row_number() OVER (PARTITION BY affair_id,language ORDER BY created_at DESC)=1
        ORDER BY affair_id,language LIMIT ?""", [topic_id, version, model, include_stale, PROMPT_VERSION, after_id, label_id, label_id, limit])
    results = [json.loads(item["result"]) for item in records]
    if len(results) == limit and results[0]["affair_id"] != results[-1]["affair_id"]:
        # The cursor is an affair id, so never split one affair's languages across pages.
        results = [item for item in results if item["affair_id"] != results[-1]["affair_id"]]
    with classifier.model_context(model):
        current_results = [item for item in results if item.get("model") == model and (include_stale or classifier.result_is_current(item))]
    return {"results": current_results,
            "next_after_id": max((item["affair_id"] for item in results), default=None),
            "note": "Saved predictions; some may use an earlier prompt version." if include_stale else "Current saved predictions only; human corrections remain separate review records."}


@app.get("/api/jobs")
def list_jobs(topic_id: str | None = Query(default=None, max_length=200)):
    automatic = jobs.ensure_continuous_classification()
    if topic_id == "aps" and automatic:
        return [automatic]
    candidates = db.query("SELECT id FROM jobs WHERE status IN ('queued','running','paused','cancelled','completed_with_errors') AND (? IS NULL OR topic_id=?) ORDER BY created_at DESC LIMIT 20", [topic_id, topic_id])
    records = [jobs.get_job(item["id"]) for item in candidates]
    available = [item for item in records if item["status"] in ("queued", "running") or item["resumable"]][:5]
    if available:
        return available
    completed = db.query("SELECT id FROM jobs WHERE status='completed' AND (? IS NULL OR topic_id=?) ORDER BY created_at DESC LIMIT 1", [topic_id, topic_id])
    return [jobs.get_job(completed[0]["id"])] if completed else []


@app.post("/api/jobs")
def create_job(request: JobRequest):
    items = [{"affair_id": identifier} for identifier in request.affair_ids] if request.affair_ids is not None else None
    if request.after_id is not None and items is None:
        items = db.query("SELECT id AS affair_id FROM affairs WHERE id>? AND (? IS NULL OR body_key=?) ORDER BY id LIMIT ?", [request.after_id, request.body, request.body, request.limit])
    selected = classifier.model_name(request.model)
    result = jobs.create_job("classify", request.topic_id, request.limit, items, request.body, selected, request.full_corpus)
    if request.calibration:
        config = result["config"] | {"calibration": True}
        db.execute("UPDATE jobs SET config=? WHERE id=?", [json.dumps(config), result["id"]])
        result = jobs.get_job(result["id"])
    return result


@app.get("/api/jobs/estimate")
def job_estimate(model: str = Query(default="apertus-v1-5-70b"), topic_id: str = "aps"):
    selected = classifier.model_name(model)
    classifier.topic_context(topic_id)
    runs = db.query("SELECT id,total,status,config,topic_id FROM jobs WHERE kind='classify' ORDER BY created_at DESC LIMIT 100")
    for run in runs:
        config = json.loads(run["config"])
        if config.get("calibration") and config.get("model") == selected and run["topic_id"] == topic_id and run["total"] == 100 and run["status"] in ("completed", "completed_with_errors"):
            counts = {row["status"]: row["count"] for row in db.query("SELECT status,count(*) AS count FROM job_items WHERE job_id=? GROUP BY status", [run["id"]])}
            elapsed = db.query("SELECT elapsed_seconds AS seconds FROM jobs WHERE id=?", [run["id"]])[0]["seconds"]
            return {"model": selected, "sample_size": 100, "elapsed_seconds": elapsed, "seconds_per_case": elapsed / 100 if elapsed else None,
                    "estimated_300k_seconds": elapsed * 3000 if elapsed else None, "completed": counts.get("done", 0), "failed": counts.get("failed", 0), "job_id": run["id"]}
    return {"model": selected, "sample_size": 0, "notice": "Run the 100-affair pilot to measure this model against your local archive."}


@app.get("/api/jobs/{identifier}")
def job(identifier: str):
    record = jobs.get_job(identifier)
    record["topic_distribution"] = jobs.topic_distribution(identifier) if record["kind"] == "classify" else []
    record["topic_graph"] = jobs.topic_relationships(identifier, record["topic_distribution"]) if record["kind"] == "classify" else {"nodes": [], "edges": [], "total_topics": 0}
    record["quality"] = live_run_report(identifier, record["topic_id"]) if record["kind"] == "classify" else None
    if record["quality"] is not None:
        human = record["quality"]
        record["quality"] = {**human, **judge.report(identifier), "human_reviewed": human["reviewed"], "human_scores": human["scores"]}
    record["topic_examples"] = jobs.topic_examples(identifier, limit=4) if record["kind"] == "classify" else []
    if record.get("started_at"):
        timing = db.query("SELECT coalesce(elapsed_seconds,0)+CASE WHEN status='running' THEN date_diff('second',started_at,current_timestamp) ELSE 0 END AS seconds FROM jobs WHERE id=?", [identifier])[0]
        record["elapsed_seconds"] = timing["seconds"]
        done = sum(item["count"] for item in record["progress"] if item["status"] == "done")
        record["live_estimated_total_seconds"] = timing["seconds"] / done * record["total"] if done else None
        record["live_estimated_remaining_seconds"] = max(0, record["live_estimated_total_seconds"] - timing["seconds"]) if record["live_estimated_total_seconds"] is not None else None
        record["live_cases_per_minute"] = done * 60 / timing["seconds"] if timing["seconds"] > 0 else None
    return record


@app.post("/api/jobs/{identifier}/{action}")
def job_action(identifier: str, action: str):
    return jobs.control_job(identifier, action)


@app.get("/api/evaluation")
def evaluation(topic_id: str = "aps"):
    return report(topic_id)


@app.get("/api/evaluation/sample")
def sample():
    return evaluation_sample(200)


@app.get("/chat")
def chat(message: str = Query(min_length=1, max_length=4000)):
    if not message.strip():
        raise HTTPException(400, "Please enter a message.")
    try:
        return {"reply": ask_apertus(message)}
    except ValueError as exc:
        raise HTTPException(503, str(exc)) from exc
    except APITimeoutError as exc:
        raise HTTPException(504, "Keera timed out. Please try again.") from exc
    except APIConnectionError as exc:
        raise HTTPException(502, "Cannot connect to Keera.") from exc
    except APIStatusError as exc:
        raise HTTPException(502, f"Keera returned HTTP {exc.status_code}.") from exc


class FactCheckRequest(BaseModel):
    text: str = Field(min_length=1, max_length=12000)
    language: str = Field(default="en", pattern="^(en|de|fr|it|rm)$")
    topic_ids: list[str] = Field(default_factory=list, max_length=3)
    model: Literal["apertus-v1-5-8b", "apertus-v1-5-70b"] = "apertus-v1-5-70b"


@app.post("/api/fact-checks")
def create_fact_check(request: FactCheckRequest):
    from parliament.factcheck import create
    classifier.model_name(request.model)
    return create(request.text, request.language, request.topic_ids, request.model)


@app.post("/api/fact-checks/{identifier}/sentences/{index}")
def check_news_sentence(identifier: str, index: int, force_archive: bool = False):
    from parliament.factcheck import check
    return check(identifier, index, force_archive)


@app.post("/api/fact-checks/{identifier}/sentences/{index}/translations/{language}")
def translate_news_sentence(identifier: str, index: int, language: Literal["en", "de", "fr", "it", "rm"]):
    from parliament.factcheck import translate_result
    return translate_result(identifier, index, language)


# PoliBot accepts source identifiers, never arbitrary narration or API credentials.
@app.get("/api/polibot/status")
def polibot_status():
    from parliament.polibot import speech_available
    return JSONResponse({"speech_available": speech_available(), "language": "en"}, headers={"Cache-Control": "no-store"})


@app.post("/api/polibot/summary")
def polibot_summary(request: PoliBotContext):
    from parliament.polibot import briefing
    return JSONResponse(briefing(request), headers={"Cache-Control": "no-store"})


@app.post("/api/polibot/speech")
def polibot_speech(request: PoliBotContext):
    from fastapi.responses import Response
    from parliament.polibot import briefing, synthesize
    result = briefing(request)
    if request.briefing_hash and request.briefing_hash != result["briefing_hash"]:
        raise HTTPException(409, "The evidence changed. Generate a fresh briefing before speaking.")
    return Response(synthesize(result["text"]), media_type="audio/mpeg", headers={"Cache-Control": "no-store"})


@app.post("/api/polibot/chat")
def polibot_chat(request: PoliBotChatRequest):
    from parliament.polibot import chat
    return JSONResponse(chat(request), headers={"Cache-Control": "no-store"})
