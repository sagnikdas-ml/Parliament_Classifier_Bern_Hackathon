import hashlib
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = Path(os.environ.get("PARL_DATA_DIR", ROOT / "data"))
API = "https://api.openparldata.ch/v1"
FILES = "https://files.openparldata.ch"
MODEL = "intfloat/multilingual-e5-small"
EMBED_VERSION = "e5-passage-480-overlap64-v1"
PROMPT_VERSION = "named-policy-evidence-v6"
LANGUAGES = ("de", "fr", "it", "rm")


def digest(value):
    if not isinstance(value, str):
        value = json.dumps(value, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(value.encode()).hexdigest()


def json_text(value):
    return json.dumps(value, ensure_ascii=False)
