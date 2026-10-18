from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from openai import APIConnectionError, APIStatusError, APITimeoutError

from test_apertus import ask_apertus

app = FastAPI()


@app.get("/")
def home():
    return FileResponse(Path(__file__).with_name("chat.html"))


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
