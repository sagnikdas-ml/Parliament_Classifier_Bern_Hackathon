from pathlib import Path
from contextlib import asynccontextmanager
import json
import os
import secrets
from datetime import date

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.responses import JSONResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from openai import APIConnectionError, APIStatusError, APITimeoutError

from test_apertus import ask_apertus
from parliament import db
from parliament import classifier, jobs, retrieval
from parliament.config import ROOT
from parliament.evaluation import report, evaluation_sample
from parliament.ingest import ensure_affair


@asynccontextmanager
async def lifespan(app):
    from parliament.digitalisation import ensure_topic
    ensure_topic()
    jobs.start_worker()
    yield
    jobs.stop_worker()


app = FastAPI(title="PoliNews", lifespan=lifespan)
app.mount("/assets", StaticFiles(directory=ROOT / "web" / "public" / "assets"), name="assets")


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
    return FileResponse(ROOT / "web" / "public" / "index.html")


@app.get("/admin")
def admin():
    return FileResponse(ROOT / "dashboard.html")


@app.get("/chat-ui")
def chat_ui():
    return FileResponse(ROOT / "chat.html")


class ClassificationRequest(BaseModel):
    topic_id: str = "aps"
    language: str | None = Field(default=None, pattern="^(de|fr|it|rm)$")


class TopicRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    definition: str = Field(min_length=10, max_length=4000)
    keywords: dict[str, list[str]] = Field(default_factory=dict)


class DraftRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class JobRequest(BaseModel):
    topic_id: str = "aps"
    limit: int = Field(default=20, ge=1, le=10000)
    affair_ids: list[int] | None = Field(default=None, max_length=10000)
    body: str | None = None
    after_id: int | None = Field(default=None, ge=0)


class ReviewRequest(BaseModel):
    topic_id: str = "aps"
    language: str = Field(pattern="^(de|fr|it|rm|und)$")
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
def affair(affair_id: int):
    record = ensure_affair(affair_id)
    record["titles"] = json.loads(record["titles"])
    record["units"] = db.query("SELECT * FROM units WHERE affair_id=?", [affair_id])
    record["classifications"] = [json.loads(item["result"]) for item in db.query("SELECT result FROM classifications WHERE affair_id=? ORDER BY created_at DESC", [affair_id])]
    for prediction in record["classifications"]:
        prediction["current"] = classifier.result_is_current(prediction)
    record["reviews"] = db.query("SELECT * EXCLUDE(prediction) FROM reviews WHERE affair_id=?", [affair_id])
    return record


@app.post("/api/affairs/{affair_id}/classify")
def classify(affair_id: int, request: ClassificationRequest):
    return classifier.classify(affair_id, request.topic_id, request.language)


@app.post("/api/affairs/{affair_id}/review")
def review(affair_id: int, request: ReviewRequest):
    return classifier.review(affair_id, **request.model_dump())


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


class ResearchAnalyseRequest(BaseModel):
    affair_id: int = Field(gt=0)
    topic_id: str = Field(min_length=1, max_length=200)
    date_from: date
    date_to: date
    language: str | None = Field(default=None, pattern="^(de|fr|it|rm)$")


@app.post("/api/research/search")
def research_search(request: ResearchSearchRequest):
    from parliament.query_workflow import find
    if request.date_from and request.date_to and request.date_from > request.date_to:
        raise ValueError("The start date must not be after the end date.")
    return find(request.question, request.date_from, request.date_to, request.body, request.language, request.live, request.semantic)


@app.post("/api/research/analyse")
def research_analyse(request: ResearchAnalyseRequest):
    from parliament.query_workflow import analyse
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
def classifications(topic_id: str = "aps", label_id: str | None = None, limit: int = Query(default=50, ge=1, le=200), after_id: int = Query(default=0, ge=0)):
    version = classifier.topic_context(topic_id)[1]
    from parliament.config import PROMPT_VERSION
    records = db.query("""SELECT result FROM classifications c
        WHERE topic_id=? AND topic_version=? AND model=? AND prompt_version=? AND affair_id>?
        AND (? IS NULL OR EXISTS (SELECT 1 FROM json_each(c.result, '$.labels') label
          WHERE json_extract_string(label.value,'$.topic_id')=?))
        QUALIFY row_number() OVER (PARTITION BY affair_id,language ORDER BY created_at DESC)=1
        ORDER BY affair_id,language LIMIT ?""", [topic_id, version, classifier.model_name(), PROMPT_VERSION, after_id, label_id, label_id, limit])
    results = [json.loads(item["result"]) for item in records]
    if len(results) == limit and results[0]["affair_id"] != results[-1]["affair_id"]:
        # The cursor is an affair id, so never split one affair's languages across pages.
        results = [item for item in results if item["affair_id"] != results[-1]["affair_id"]]
    return {"results": [item for item in results if classifier.result_is_current(item)],
            "next_after_id": max((item["affair_id"] for item in results), default=None),
            "note": "Current saved predictions only; human corrections remain separate review records."}


@app.get("/api/jobs")
def list_jobs():
    return [jobs.get_job(item["id"]) for item in db.query("SELECT id FROM jobs ORDER BY created_at DESC LIMIT 20")]


@app.post("/api/jobs")
def create_job(request: JobRequest):
    items = [{"affair_id": identifier} for identifier in request.affair_ids] if request.affair_ids is not None else None
    if request.after_id is not None and items is None:
        items = db.query("SELECT id AS affair_id FROM affairs WHERE id>? AND (? IS NULL OR body_key=?) ORDER BY id LIMIT ?", [request.after_id, request.body, request.body, request.limit])
    return jobs.create_job("classify", request.topic_id, request.limit, items, request.body)


@app.get("/api/jobs/{identifier}")
def job(identifier: str):
    return jobs.get_job(identifier)


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


@app.post("/api/fact-checks")
def create_fact_check(request: FactCheckRequest):
    from parliament.factcheck import create
    return create(request.text, request.language, request.topic_ids)


@app.post("/api/fact-checks/{identifier}/sentences/{index}")
def check_news_sentence(identifier: str, index: int, force_archive: bool = False):
    from parliament.factcheck import check
    return check(identifier, index, force_archive)
