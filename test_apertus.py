import os
import sys
from pathlib import Path

from openai import APIConnectionError, APIStatusError, APITimeoutError, OpenAI


def ask_apertus(message: str) -> str:
    key = os.environ.get("KEERA_API_KEY", "").strip()
    key_file = Path(__file__).resolve().with_name(".key")
    if not key and key_file.is_file():
        key = key_file.read_text().strip()
    if not key:
        raise ValueError("Set KEERA_API_KEY or put your team key in .key beside this script.")

    with OpenAI(
        api_key=key,
        base_url="https://gateway.keera.ch/api/v1",
        timeout=30.0,
        max_retries=0,
    ) as client:
        response = client.chat.completions.create(
            model="apertus-v1-5-8b",
            messages=[
                {"role": "system", "content": "You are a helpful assistant."},
                {"role": "user", "content": message},
            ],
            temperature=0.2,
            max_tokens=300,
        )
    return response.choices[0].message.content or ""


def main():
    print("Contacting Apertus…", flush=True)
    try:
        answer = ask_apertus("Explain what the Swiss Parliament does.")
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    except APITimeoutError:
        print("Keera timed out. Try again shortly.", file=sys.stderr)
        return 1
    except APIConnectionError:
        print("Cannot connect to Keera. Check your network connection.", file=sys.stderr)
        return 1
    except APIStatusError as exc:
        print(f"Keera returned HTTP {exc.status_code}. Check your key and service availability.", file=sys.stderr)
        return 1

    print(answer)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\nCancelled.", file=sys.stderr)
        sys.exit(130)
