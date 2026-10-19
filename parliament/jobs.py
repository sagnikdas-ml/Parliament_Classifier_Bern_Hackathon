import json
import fcntl
import threading
import uuid

from parliament import db
from parliament.classifier import classify, model_name, model_context, topic_context
from parliament.config import PROMPT_VERSION, json_text
from parliament.ingest import fetch_content, sample_affairs

WORKER_LOCK = threading.Lock()
STOP = threading.Event()
THREAD = None
AUTO_START_LOCK = threading.Lock()


def ensure_continuous_classification():
    """Create (or restart) the one persistent 300k APS archive run."""
    db.DATA.mkdir(parents=True, exist_ok=True)
    with AUTO_START_LOCK, (db.DATA / "continuous-classification.lock").open("a+") as lease:
        fcntl.flock(lease, fcntl.LOCK_EX)
        for row in db.query("SELECT id,status,config FROM jobs WHERE kind='classify' ORDER BY created_at DESC"):
            try:
                config = json.loads(row["config"])
            except (TypeError, json.JSONDecodeError):
                continue
            if not config.get("continuous_archive"):
                continue
            if row["status"] in ("paused", "cancelled", "completed_with_errors"):
                with db.connect() as connection:
                    connection.execute("UPDATE job_items SET status='pending',error=NULL,attempts=0 WHERE job_id=? AND status IN ('failed','running')", [row["id"]])
                    connection.execute("UPDATE jobs SET status='queued',finished_at=NULL WHERE id=?", [row["id"]])
            return get_job(row["id"])
        count = db.query("SELECT count(*) AS count FROM affairs")[0]["count"]
        if not count:
            return None
        try:
            job = create_job("classify", "aps", 300000, model="apertus-v1-5-8b", full_corpus=True)
        except ValueError as error:
            if "APS catalogue" in str(error) or "No affairs selected" in str(error):
                return None
            raise
        config = job["config"] | {"continuous_archive": True}
        db.execute("UPDATE jobs SET config=? WHERE id=?", [json_text(config), job["id"]])
        return get_job(job["id"])


def create_job(kind, topic_id="aps", limit=20, items=None, body=None, model=None, full_corpus=False):
    if kind not in ("classify", "fetch") or not 1 <= limit <= 500000:
        raise ValueError("Jobs require a supported kind and limit between 1 and 500000")
    model = model or model_name()
    model = model_name(model)
    version = topic_context(topic_id)[1] if kind == "classify" else None
    if full_corpus:
        item_total = db.query("SELECT count(*) AS count FROM (SELECT id FROM affairs ORDER BY id LIMIT ?)", [limit])[0]["count"]
        if not item_total:
            raise ValueError("No affairs selected; import data first")
    elif items is None:
        items = sample_affairs(limit) if not body else db.query("SELECT id AS affair_id, NULL AS language FROM affairs WHERE body_key=? ORDER BY id LIMIT ?", [body, limit])
    if not full_corpus:
        items = list({(int(item["affair_id"]), item.get("language") or "auto"): item for item in items}.values())[:limit]
        item_total = len(items)
        if not items:
            raise ValueError("No affairs selected; import data first")
    identifier = uuid.uuid4().hex[:16]
    with db.connect() as connection:
        connection.execute("BEGIN")
        try:
            connection.execute("INSERT INTO jobs (id,kind,topic_id,status,config,total) VALUES (?,?,?,'queued',?,?)", [identifier, kind, topic_id, json_text({"limit": limit, "topic_version": version, "model": model, "prompt_version": PROMPT_VERSION, "full_corpus": full_corpus}), item_total])
            if full_corpus:
                connection.execute("INSERT INTO job_items (job_id,affair_id,language,status,error,result) SELECT ?,id,'auto','pending',NULL,NULL FROM affairs ORDER BY id LIMIT ?", [identifier, limit])
            else:
                connection.executemany("INSERT INTO job_items (job_id,affair_id,language,status,error,result) VALUES (?,?,?,'pending',NULL,NULL)", [(identifier, int(item["affair_id"]), item.get("language") or "auto") for item in items])
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
    job["resumable"] = False
    if job["status"] in ("paused", "cancelled", "completed_with_errors") and job["config"].get("model") in ("apertus-v1-5-8b", "apertus-v1-5-70b") and job["config"].get("prompt_version") == PROMPT_VERSION:
        try:
            job["resumable"] = job["kind"] != "classify" or topic_context(job["topic_id"])[1] == job["config"].get("topic_version")
        except ValueError:
            job["resumable"] = False
    return job


def topic_distribution(identifier):
    """Count distinct affairs per assigned topic within this run, not the cache."""
    return db.query("""
        WITH assigned AS (
            SELECT item.affair_id,
                   json_extract_string(label.value, '$.topic_id') AS topic_id,
                   json_extract_string(label.value, '$.name') AS name
            FROM (SELECT affair_id, result FROM job_items
                  WHERE job_id=? AND status='done' AND json_valid(result)) item,
                 json_each(item.result, '$.labels') label
            WHERE json_extract_string(item.result, '$.status')='relevant'
        )
        SELECT assigned.topic_id,
               coalesce(max(assigned.name), max(topics.name), assigned.topic_id) AS name,
               count(DISTINCT affair_id) AS count
        FROM assigned LEFT JOIN topics ON topics.id=assigned.topic_id
        WHERE assigned.topic_id IS NOT NULL
        GROUP BY assigned.topic_id
        ORDER BY count DESC, name ASC, assigned.topic_id ASC
    """, [identifier])


def control_job(identifier, action):
    job = get_job(identifier)
    if action == "cancel":
        db.execute("UPDATE jobs SET status='cancelled' WHERE id=?", [identifier])
    elif action == "resume":
        if job["status"] in ("queued", "running"):
            raise ValueError("Job is already active")
        if job["kind"] == "classify" and topic_context(job["topic_id"])[1] != job["config"]["topic_version"]:
            raise ValueError("Topic definition changed; start a new job")
        model_name(job["config"].get("model"))
        if job["kind"] == "classify" and job["config"].get("prompt_version") != PROMPT_VERSION:
            raise ValueError("Prompt changed; start a new job")
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
        db.execute("UPDATE jobs SET status='running',started_at=current_timestamp,finished_at=NULL WHERE id=? AND status='queued'", [identifier])
        cursor_id, cursor_language = 0, ""
        while not STOP.is_set() and db.query("SELECT status FROM jobs WHERE id=?", [identifier])[0]["status"] == "running":
            items = db.query("SELECT * FROM job_items WHERE job_id=? AND status='pending' AND (affair_id>? OR (affair_id=? AND language>?)) ORDER BY affair_id,language LIMIT 200", [identifier, cursor_id, cursor_id, cursor_language])
            if not items:
                # A resumed job may have only lower-ID failed records reset to pending.
                items = db.query("SELECT * FROM job_items WHERE job_id=? AND status='pending' ORDER BY affair_id,language LIMIT 200", [identifier])
                if not items:
                    break
            for item in items:
                if STOP.is_set() or db.query("SELECT status FROM jobs WHERE id=?", [identifier])[0]["status"] != "running":
                    break
                if job["kind"] == "classify" and topic_context(job["topic_id"])[1] != job["config"]["topic_version"]:
                    db.execute("UPDATE jobs SET status='paused' WHERE id=?", [identifier])
                    break
                key = [identifier, item["affair_id"], item["language"]]
                db.execute("UPDATE job_items SET status='running',attempts=attempts+1 WHERE job_id=? AND affair_id=? AND language=?", key)
                try:
                    if job["kind"] == "classify":
                        with model_context(job["config"].get("model")):
                            result = classify(item["affair_id"], job["topic_id"], None if item["language"] == "auto" else item["language"])
                    else:
                        fetch_content(item["affair_id"])
                        result = {"fetched": True}
                    db.execute("UPDATE job_items SET status='done',result=? WHERE job_id=? AND affair_id=? AND language=?", [json_text(result), *key])
                except Exception as error:
                    message = f"{type(error).__name__}: {str(error)[:300]}"
                    if job["config"].get("continuous_archive") and item.get("attempts", 0) + 1 < 3:
                        db.execute("UPDATE job_items SET status='pending',error=? WHERE job_id=? AND affair_id=? AND language=?", [f"Retry scheduled: {message}", *key])
                    else:
                        db.execute("UPDATE job_items SET status='failed',error=? WHERE job_id=? AND affair_id=? AND language=?", [message, *key])
                cursor_id, cursor_language = item["affair_id"], item["language"]
        current = get_job(identifier)
        if current["status"] == "running":
            pending = any(item["status"] in ("pending", "running") for item in current["progress"])
            failed = bool(current["errors"])
            status = "paused" if pending else "completed_with_errors" if failed else "completed"
            db.execute("UPDATE jobs SET status=?,elapsed_seconds=coalesce(elapsed_seconds,0)+date_diff('second',started_at,current_timestamp),finished_at=current_timestamp WHERE id=?", [status, identifier])
        elif current["status"] in ("cancelled", "paused"):
            db.execute("UPDATE jobs SET elapsed_seconds=coalesce(elapsed_seconds,0)+date_diff('second',started_at,current_timestamp),finished_at=current_timestamp WHERE id=?", [identifier])
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
                connection.execute("UPDATE jobs SET status='paused',elapsed_seconds=coalesce(elapsed_seconds,0)+coalesce(date_diff('second',started_at,current_timestamp),0),finished_at=current_timestamp WHERE status='running'")
                connection.execute("UPDATE job_items SET status='pending' WHERE status='running'")

    try:
        ensure_continuous_classification()
    except Exception as error:
        # Keep the API available if the archive has not been imported yet.
        print(f"Continuous archive classification not started: {type(error).__name__}: {error}")

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
