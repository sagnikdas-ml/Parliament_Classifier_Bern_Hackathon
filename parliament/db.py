import fcntl
import threading
from contextlib import contextmanager

import duckdb

from parliament.config import DATA

LOCK = threading.RLock()
SCHEMA = """
CREATE TABLE IF NOT EXISTS fact_checks (
 id VARCHAR PRIMARY KEY, input VARCHAR, sentences VARCHAR, model VARCHAR, version VARCHAR,
 created_at TIMESTAMP DEFAULT current_timestamp, language VARCHAR DEFAULT 'en', topic_ids VARCHAR DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS fact_check_sentences (
 run_id VARCHAR, sentence_index INTEGER, result VARCHAR,
 checked_at TIMESTAMP DEFAULT current_timestamp, PRIMARY KEY(run_id,sentence_index)
);
CREATE TABLE IF NOT EXISTS fact_check_translations (
 run_id VARCHAR, sentence_index INTEGER, language VARCHAR, result VARCHAR,
 translated_at TIMESTAMP DEFAULT current_timestamp,
 PRIMARY KEY(run_id,sentence_index,language)
);
CREATE TABLE IF NOT EXISTS affairs (
 id BIGINT PRIMARY KEY, body_key VARCHAR, begin_date VARCHAR,
 titles VARCHAR, source_url VARCHAR, source_hash VARCHAR, raw VARCHAR,
 fetched_at TIMESTAMP DEFAULT current_timestamp
);
CREATE TABLE IF NOT EXISTS bodies (id VARCHAR PRIMARY KEY, raw VARCHAR);
CREATE TABLE IF NOT EXISTS units (
 id VARCHAR PRIMARY KEY, affair_id BIGINT, language VARCHAR, kind VARCHAR,
 text VARCHAR, source_url VARCHAR, content_hash VARCHAR,
 fetched_at TIMESTAMP DEFAULT current_timestamp
);
CREATE TABLE IF NOT EXISTS topics (
 id VARCHAR PRIMARY KEY, scheme VARCHAR, name VARCHAR, definition VARCHAR,
 version INTEGER, raw VARCHAR, updated_at TIMESTAMP DEFAULT current_timestamp
);
CREATE TABLE IF NOT EXISTS source_labels (
 affair_id BIGINT, scheme VARCHAR, labels VARCHAR,
 PRIMARY KEY (affair_id, scheme)
);
CREATE TABLE IF NOT EXISTS fetches (
 affair_id BIGINT, kind VARCHAR, fetched_at TIMESTAMP DEFAULT current_timestamp,
 PRIMARY KEY (affair_id, kind)
);
CREATE TABLE IF NOT EXISTS embeddings (
 id VARCHAR PRIMARY KEY, unit_id VARCHAR, content_hash VARCHAR,
 pipeline VARCHAR, model VARCHAR, revision VARCHAR, passage VARCHAR, vector FLOAT[]
);
CREATE TABLE IF NOT EXISTS settings (key VARCHAR PRIMARY KEY, value VARCHAR);
CREATE TABLE IF NOT EXISTS classifications (
 cache_key VARCHAR PRIMARY KEY, affair_id BIGINT, topic_id VARCHAR,
 topic_version VARCHAR, language VARCHAR, content_hash VARCHAR,
 model VARCHAR, prompt_version VARCHAR, result VARCHAR,
 created_at TIMESTAMP DEFAULT current_timestamp
);
CREATE TABLE IF NOT EXISTS reviews (
 affair_id BIGINT, topic_id VARCHAR, language VARCHAR, labels VARCHAR,
 relevant BOOLEAN, frozen BOOLEAN, notes VARCHAR,
 prediction VARCHAR,
 reviewed_at TIMESTAMP DEFAULT current_timestamp,
 PRIMARY KEY (affair_id, topic_id, language)
);
CREATE TABLE IF NOT EXISTS jobs (
 id VARCHAR PRIMARY KEY, kind VARCHAR, topic_id VARCHAR, status VARCHAR,
 config VARCHAR, total INTEGER, created_at TIMESTAMP DEFAULT current_timestamp,
 started_at TIMESTAMP, finished_at TIMESTAMP, elapsed_seconds BIGINT DEFAULT 0
);
CREATE TABLE IF NOT EXISTS job_items (
 job_id VARCHAR, affair_id BIGINT, language VARCHAR, status VARCHAR,
 error VARCHAR, result VARCHAR, attempts INTEGER DEFAULT 0,
 PRIMARY KEY (job_id, affair_id, language)
);
CREATE TABLE IF NOT EXISTS llm_judgments (
 job_id VARCHAR, affair_id BIGINT, language VARCHAR, result_hash VARCHAR,
 judge_version VARCHAR, judge_model VARCHAR, status VARCHAR, attempts INTEGER,
 result VARCHAR, prediction_snapshot VARCHAR, exact_match BOOLEAN,
 true_positive INTEGER, false_positive INTEGER, false_negative INTEGER,
 repair_queued BOOLEAN DEFAULT false, error VARCHAR, updated_at TIMESTAMP DEFAULT current_timestamp,
 PRIMARY KEY(job_id,affair_id,language,judge_version)
);
"""


@contextmanager
def connect():
    DATA.mkdir(parents=True, exist_ok=True)
    with LOCK, (DATA / "database.lock").open("a+") as lock_file:
        fcntl.flock(lock_file, fcntl.LOCK_EX)
        connection = duckdb.connect(str(DATA / "parliament.duckdb"))
        connection.execute("SET memory_limit='1GB'")
        connection.execute("SET threads=2")
        try:
            connection.execute(SCHEMA)
            connection.execute("ALTER TABLE reviews ADD COLUMN IF NOT EXISTS prediction VARCHAR")
            connection.execute("ALTER TABLE fact_checks ADD COLUMN IF NOT EXISTS language VARCHAR DEFAULT 'en'")
            connection.execute("ALTER TABLE fact_checks ADD COLUMN IF NOT EXISTS topic_ids VARCHAR DEFAULT '[]'")
            connection.execute("ALTER TABLE jobs ADD COLUMN IF NOT EXISTS started_at TIMESTAMP")
            connection.execute("ALTER TABLE jobs ADD COLUMN IF NOT EXISTS finished_at TIMESTAMP")
            connection.execute("ALTER TABLE jobs ADD COLUMN IF NOT EXISTS elapsed_seconds BIGINT DEFAULT 0")
            connection.execute("ALTER TABLE job_items ADD COLUMN IF NOT EXISTS attempts INTEGER DEFAULT 0")
            connection.execute("ALTER TABLE llm_judgments ADD COLUMN IF NOT EXISTS prediction_snapshot VARCHAR")
            connection.execute("ALTER TABLE llm_judgments ADD COLUMN IF NOT EXISTS exact_match BOOLEAN")
            connection.execute("ALTER TABLE llm_judgments ADD COLUMN IF NOT EXISTS true_positive INTEGER")
            connection.execute("ALTER TABLE llm_judgments ADD COLUMN IF NOT EXISTS false_positive INTEGER")
            connection.execute("ALTER TABLE llm_judgments ADD COLUMN IF NOT EXISTS false_negative INTEGER")
            connection.execute("ALTER TABLE llm_judgments ADD COLUMN IF NOT EXISTS repair_queued BOOLEAN DEFAULT false")
            connection.execute("UPDATE llm_judgments SET status='failed',attempts=0,error='Rejudging legacy score without saved prediction snapshot.' WHERE status='judged' AND prediction_snapshot IS NULL")
            connection.execute("UPDATE llm_judgments SET status='failed',attempts=0,repair_queued=true,error='Scheduling focused evidence repair.' WHERE judge_version='blind-archive-judge-v1' AND status='failed' AND error LIKE '%Model evidence is not a verified substantive source passage%' AND repair_queued=false")
            yield connection
        finally:
            connection.close()


def rows(connection, sql, parameters=None):
    cursor = connection.execute(sql, parameters or [])
    names = [column[0] for column in cursor.description]
    return [dict(zip(names, row)) for row in cursor.fetchall()]


def query(sql, parameters=None):
    with connect() as connection:
        return rows(connection, sql, parameters)


def execute(sql, parameters=None):
    with connect() as connection:
        connection.execute(sql, parameters or [])
