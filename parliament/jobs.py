import json
import fcntl
import threading
import uuid

from parliament import db
from parliament.classifier import classify, model_name, topic_context
from parliament.config import PROMPT_VERSION, json_text
from parliament.ingest import fetch_content, sample_affairs

WORKER_LOCK = threading.Lock()
STOP = threading.Event()
THREAD = None


def create_job(kind, topic_id="aps", limit=20, items=None, body=None):
    if kind not in ("classify", "fetch") or not 1 <= limit <= 10000:
        raise ValueError("Jobs require a supported kind and limit between 1 and 10000")
    version = topic_context(topic_id)[1] if kind == "classify" else None
    if items is None:
        items = sample_affairs(limit) if not body else db.query("SELECT id AS affair_id, NULL AS language FROM affairs WHERE body_key=? ORDER BY id LIMIT ?", [body, limit])
    items = list({(int(item["affair_id"]), item.get("language") or "auto"): item for item in items}.values())[:limit]
    if not items:
        raise ValueError("No affairs selected; import data first")
    identifier = uuid.uuid4().hex[:16]
    with db.connect() as connection:
        connection.execute("BEGIN")
        try:
            connection.execute("INSERT INTO jobs (id,kind,topic_id,status,config,total) VALUES (?,?,?,'queued',?,?)", [identifier, kind, topic_id, json_text({"limit": limit, "topic_version": version, "model": model_name(), "prompt_version": PROMPT_VERSION}), len(items)])
            connection.executemany("INSERT INTO job_items VALUES (?,?,?,'pending',NULL,NULL)", [(identifier, int(item["affair_id"]), item.get("language") or "auto") for item in items])
            connection.execute("COMMIT")
        except Exception:
            connection.execute("ROLLBACK")
            raise
    return get_job(identifier)


def get_job(identifier):
    jobs = db.query("SELECT * FROM jobs WHERE id=?", [identifier])
    if not jobs:
        raise ValueError("Unknown job")
    job = jobs[0]
    job["config"] = json.loads(job["config"])
    job["progress"] = db.query("SELECT status,count(*) AS count FROM job_items WHERE job_id=? GROUP BY status", [identifier])
    job["errors"] = db.query("SELECT affair_id,language,error FROM job_items WHERE job_id=? AND status='failed' LIMIT 20", [identifier])
    return job


def control_job(identifier, action):
    job = get_job(identifier)
    if action == "cancel":
        db.execute("UPDATE jobs SET status='cancelled' WHERE id=?", [identifier])
    elif action == "resume":
        if job["status"] in ("queued", "running"):
            raise ValueError("Job is already active")
        if job["kind"] == "classify" and topic_context(job["topic_id"])[1] != job["config"]["topic_version"]:
            raise ValueError("Topic definition changed; start a new job")
        if job["kind"] == "classify" and (job["config"].get("model") != model_name() or job["config"].get("prompt_version") != PROMPT_VERSION):
            raise ValueError("Model or prompt changed; start a new job")
        with db.connect() as connection:
            connection.execute("UPDATE job_items SET status='pending',error=NULL WHERE job_id=? AND status IN ('failed','running')", [identifier])
            connection.execute("UPDATE jobs SET status='queued' WHERE id=?", [identifier])
    else:
        raise ValueError("Action must be cancel or resume")
    return get_job(identifier)


def run_job(identifier):
    db.DATA.mkdir(parents=True, exist_ok=True)
    with (db.DATA / "worker.lock").open("a+") as lease:
        fcntl.flock(lease, fcntl.LOCK_EX | fcntl.LOCK_NB)
        return _run_job(identifier)


def _run_job(identifier):
    with WORKER_LOCK:
        job = get_job(identifier)
        if job["status"] != "queued":
            return job
        db.execute("UPDATE jobs SET status='running' WHERE id=? AND status='queued'", [identifier])
        items = db.query("SELECT * FROM job_items WHERE job_id=? AND status='pending' ORDER BY affair_id,language", [identifier])
        for item in items:
            if STOP.is_set() or get_job(identifier)["status"] != "running":
                break
            if job["kind"] == "classify" and topic_context(job["topic_id"])[1] != job["config"]["topic_version"]:
                db.execute("UPDATE jobs SET status='paused' WHERE id=?", [identifier])
                break
            key = [identifier, item["affair_id"], item["language"]]
            db.execute("UPDATE job_items SET status='running' WHERE job_id=? AND affair_id=? AND language=?", key)
            try:
                if job["kind"] == "classify":
                    result = classify(item["affair_id"], job["topic_id"], None if item["language"] == "auto" else item["language"])
                else:
                    fetch_content(item["affair_id"])
                    result = {"fetched": True}
                db.execute("UPDATE job_items SET status='done',result=? WHERE job_id=? AND affair_id=? AND language=?", [json_text(result), *key])
            except Exception as error:
                db.execute("UPDATE job_items SET status='failed',error=? WHERE job_id=? AND affair_id=? AND language=?", [f"{type(error).__name__}: {str(error)[:300]}", *key])
        current = get_job(identifier)
        if current["status"] == "running":
            pending = any(item["status"] in ("pending", "running") for item in current["progress"])
            failed = bool(current["errors"])
            status = "paused" if pending else "completed_with_errors" if failed else "completed"
            db.execute("UPDATE jobs SET status=? WHERE id=?", [status, identifier])
        return get_job(identifier)


def start_worker():
    global THREAD
    if THREAD and THREAD.is_alive():
        return
    STOP.clear()
    db.DATA.mkdir(parents=True, exist_ok=True)
    with (db.DATA / "worker.lock").open("a+") as lease:
        try:
            fcntl.flock(lease, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            pass
        else:
            with db.connect() as connection:
                connection.execute("UPDATE jobs SET status='paused' WHERE status='running'")
                connection.execute("UPDATE job_items SET status='pending' WHERE status='running'")

    def loop():
        while not STOP.is_set():
            queued = db.query("SELECT id FROM jobs WHERE status='queued' ORDER BY created_at LIMIT 1")
            if queued:
                try:
                    run_job(queued[0]["id"])
                except BlockingIOError:
                    STOP.wait(1)
                except Exception:
                    db.execute("UPDATE jobs SET status='paused' WHERE id=?", [queued[0]["id"]])
            else:
                STOP.wait(1)

    THREAD = threading.Thread(target=loop, daemon=True, name="classification-worker")
    THREAD.start()


def stop_worker():
    STOP.set()
    if THREAD:
        THREAD.join(timeout=2)
