import gzip
import json
import os
import time
import tempfile
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from parliament.config import DATA, FILES, digest


def open_url(url, headers=None):
    for attempt in range(4):
        try:
            return urlopen(Request(url, headers={"User-Agent": "ParliamentClassifier/0.1", **(headers or {})}), timeout=60)
        except HTTPError as error:
            if error.code not in (429, 500, 502, 503, 504) or attempt == 3:
                raise
            delay = min(30, int(error.headers.get("Retry-After", "0"))) if error.headers.get("Retry-After", "").isdigit() else 0
            time.sleep(max(delay, 2 ** attempt))
        except (URLError, TimeoutError):
            if attempt == 3:
                raise
            time.sleep(2 ** attempt)


def get_json(url, timeout=None):
    response = urlopen(Request(url, headers={"User-Agent": "ParliamentClassifier/0.1"}), timeout=timeout) if timeout is not None else open_url(url)
    with response:
        return json.load(response)


def api_rows(url):
    visited = set()
    while url:
        parsed = urlparse(url)
        if parsed.scheme != "https" or parsed.hostname != "api.openparldata.ch":
            raise ValueError("Unexpected API pagination URL")
        if url in visited:
            raise ValueError("Repeated API pagination URL")
        visited.add(url)
        payload = get_json(url)
        if isinstance(payload, list):
            yield from payload
            return
        yield from payload.get("data", [])
        meta = payload.get("meta", {})
        url = meta.get("next_page") if meta.get("has_more") else None
        if meta.get("has_more") and not url:
            raise ValueError("Missing API next page")


def download(url, destination, refresh=False):
    destination = Path(destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    receipt = destination.with_suffix(destination.suffix + ".receipt.json")
    if destination.exists() and receipt.exists() and not refresh:
        return destination
    partial = destination.with_suffix(destination.suffix + ".part")
    resume_meta = partial.with_suffix(partial.suffix + ".json")
    offset = partial.stat().st_size if partial.exists() and not refresh else 0
    headers = {}
    if offset and resume_meta.exists():
        previous = json.loads(resume_meta.read_text())
        if previous.get("url") == url and previous.get("validator"):
            headers = {"Range": f"bytes={offset}-", "If-Range": previous["validator"]}
    with open_url(url, headers) as response:
        resume = response.status == 206 and bool(headers)
        if resume and not response.headers.get("Content-Range", "").startswith(f"bytes {offset}-"):
            raise ValueError("Invalid download resume offset")
        resume_meta.write_text(json.dumps({"url": url, "validator": response.headers.get("ETag") or response.headers.get("Last-Modified")}))
        received = 0
        with partial.open("ab" if resume else "wb") as output:
            while block := response.read(1024 * 1024):
                output.write(block)
                received += len(block)
        expected = response.headers.get("Content-Length")
        if expected and received != int(expected):
            raise IOError("Incomplete download; rerun to resume")
    if destination.name.endswith(".gz"):
        with gzip.open(partial, "rb") as compressed:
            while compressed.read(1024 * 1024):
                pass
    import hashlib
    checksum = hashlib.sha256()
    with partial.open("rb") as downloaded:
        while block := downloaded.read(1024 * 1024):
            checksum.update(block)
    os.replace(partial, destination)
    receipt.write_text(json.dumps({"url": url, "sha256": checksum.hexdigest(), "bytes": destination.stat().st_size, "downloaded_at": time.time()}))
    resume_meta.unlink(missing_ok=True)
    return destination


def bootstrap_files(refresh=False):
    names = [
        "exports/affairs.ndjson.gz", "exports/bodies.ndjson.gz",
        "hackapertus/aps_topics.xlsx", "hackapertus/che_affairs_keywords.jsonl",
        "hackapertus/cantonal_affairs_keywords.jsonl",
        "hackapertus/politmonitor_digitalisierung.csv", "hackapertus/dvs_digitalisierung.csv",
        "hackapertus/README.md",
    ]
    for name in names:
        print(f"Downloading {name}", flush=True)
        yield download(f"{FILES}/{name}", DATA / "raw" / name, refresh)


def read_records(path):
    opener = gzip.open if str(path).endswith(".gz") else open
    with opener(path, "rt", encoding="utf-8") as source:
        for line in source:
            if line.strip():
                yield json.loads(line)


def cache_json(url, refresh=False):
    target = DATA / "api-cache" / f"{digest(url)}.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists() and not refresh:
        return json.loads(target.read_text())
    result = get_json(url)
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=target.parent, delete=False, suffix=".tmp") as output:
        temporary = Path(output.name)
        json.dump(result, output, ensure_ascii=False)
    temporary.replace(target)
    return result
