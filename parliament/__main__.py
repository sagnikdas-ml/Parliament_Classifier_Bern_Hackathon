import argparse
import json
from pathlib import Path

from parliament.config import DATA


def main():
    parser = argparse.ArgumentParser(description="Parliament classifier: local and Slurm pipelines")
    commands = parser.add_subparsers(dest="command", required=True)
    bootstrap = commands.add_parser("bootstrap", help="Download and import all affair metadata, APS catalogue and challenge labels")
    bootstrap.add_argument("--refresh", action="store_true")
    bulk = commands.add_parser("bulk-texts", help="Download/import all text export partitions, separately from GPU work")
    bulk.add_argument("--documents", action="store_true", help="Explicitly opt into the much larger document exports")
    bulk.add_argument("--refresh", action="store_true")
    fetch = commands.add_parser("fetch", help="Fetch texts for a reproducible sample or a single affair")
    fetch.add_argument("--affair", type=int)
    fetch.add_argument("--sample", type=int, default=200)
    fetch.add_argument("--documents", action="store_true")
    fetch.add_argument("--refresh", action="store_true")
    export = commands.add_parser("export-units", help="Prepare portable embedding input; no model calls")
    export.add_argument("--output", type=Path, default=DATA / "prepared" / "units.jsonl")
    export.add_argument("--sample", type=int)
    export.add_argument("--titles-only", action="store_true")
    embed = commands.add_parser("embed", help="Embed prepared input without accessing DuckDB or OpenParlData")
    embed.add_argument("--input", type=Path, required=True)
    embed.add_argument("--output", type=Path, required=True)
    embed.add_argument("--batch-size", type=int, default=8)
    embed.add_argument("--device", choices=["auto", "cpu", "mps", "cuda"], default="auto")
    embed.add_argument("--revision")
    embed.add_argument("--shard", type=int, default=0)
    embed.add_argument("--shards", type=int, default=1)
    imported = commands.add_parser("import-embeddings")
    imported.add_argument("directory", type=Path)
    classify = commands.add_parser("classify")
    classify.add_argument("affair", type=int)
    classify.add_argument("--topic", default="aps")
    classify.add_argument("--language", choices=["de", "fr", "it", "rm"])
    classify.add_argument("--force", action="store_true")
    search = commands.add_parser("search")
    search.add_argument("text")
    search.add_argument("--limit", type=int, default=30)
    search.add_argument("--body")
    search.add_argument("--lexical-only", action="store_true")
    search.add_argument("--digitalisation-eval", action="store_true")
    batch = commands.add_parser("batch", help="Run a capped classification job on the frozen sample")
    batch.add_argument("--limit", type=int, default=200)
    batch.add_argument("--topic", default="aps")
    batch.add_argument("--resume")
    evaluate = commands.add_parser("evaluate")
    evaluate.add_argument("--topic", default="aps")
    evaluate.add_argument("--output", type=Path)
    commands.add_parser("status")
    benchmark = commands.add_parser("benchmark", help="Measure retrieval latency and process memory on the current index")
    benchmark.add_argument("--query", default="digital public services")
    benchmark.add_argument("--output", type=Path, default=DATA / "evaluation" / "retrieval-benchmark.json")
    arguments = parser.parse_args()
    if arguments.command == "bootstrap":
        from parliament.ingest import bootstrap
        result = bootstrap(arguments.refresh)
    elif arguments.command == "bulk-texts":
        from parliament.ingest import bulk_texts
        result = bulk_texts(arguments.documents, arguments.refresh)
    elif arguments.command == "fetch":
        from parliament.ingest import fetch_content
        from parliament.evaluation import evaluation_sample
        items = [{"affair_id": arguments.affair}] if arguments.affair else evaluation_sample(arguments.sample)
        errors = []
        for index, item in enumerate(items):
            try:
                fetch_content(item["affair_id"], refresh=arguments.refresh)
                if arguments.documents:
                    fetch_content(item["affair_id"], docs=True, refresh=arguments.refresh)
            except Exception as error:
                errors.append({"affair_id": item["affair_id"], "error": str(error)})
            print(f"Fetched {index + 1}/{len(items)}", flush=True)
        result = {"attempted": len(items), "errors": errors}
    elif arguments.command == "export-units":
        from parliament.embeddings import export_units
        from parliament.evaluation import evaluation_sample
        result = export_units(arguments.output, evaluation_sample(arguments.sample) if arguments.sample else None, arguments.titles_only)
    elif arguments.command == "embed":
        from parliament.embeddings import embed_file
        result = embed_file(arguments.input, arguments.output, arguments.batch_size, arguments.device, arguments.shard, arguments.shards, arguments.revision)
    elif arguments.command == "import-embeddings":
        from parliament.embeddings import import_embeddings
        result = import_embeddings(arguments.directory)
    elif arguments.command == "classify":
        from parliament.classifier import classify
        result = classify(arguments.affair, arguments.topic, arguments.language, force=arguments.force)
    elif arguments.command == "search":
        from parliament.retrieval import search
        result = search(arguments.text, arguments.limit, arguments.body, not arguments.lexical_only)
        if arguments.digitalisation_eval:
            from parliament.evaluation import digitalisation_recall
            result["evaluation"] = digitalisation_recall([item["id"] for item in result["results"]], arguments.body)
    elif arguments.command == "batch":
        from parliament.evaluation import evaluation_sample
        from parliament.jobs import control_job, create_job, run_job
        job = control_job(arguments.resume, "resume") if arguments.resume else create_job("classify", arguments.topic, arguments.limit, evaluation_sample(arguments.limit))
        print(f"Job {job['id']}", flush=True)
        result = run_job(job["id"])
    elif arguments.command == "evaluate":
        from parliament.evaluation import report
        result = report(arguments.topic)
        if arguments.output:
            arguments.output.parent.mkdir(parents=True, exist_ok=True)
            arguments.output.write_text(json.dumps(result, ensure_ascii=False, indent=2, default=str))
    elif arguments.command == "benchmark":
        import resource
        import sys
        from parliament.retrieval import search
        measurements = [search(arguments.query, limit=10) for _ in range(3)]
        result = {"coverage": measurements[-1]["coverage"], "query": arguments.query,
                  "latency_seconds": [item["elapsed_seconds"] for item in measurements],
                  "peak_process_rss_mb": round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / (1024 * 1024 if sys.platform == "darwin" else 1024), 1),
                  "note": "First run includes model startup. Process RSS does not measure total system or GPU memory."}
        arguments.output.parent.mkdir(parents=True, exist_ok=True)
        arguments.output.write_text(json.dumps(result, indent=2))
    else:
        from parliament.retrieval import coverage
        result = coverage()
    print(json.dumps(result, ensure_ascii=False, indent=2, default=str))


if __name__ == "__main__":
    main()
