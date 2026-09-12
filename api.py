"""
api.py — FastAPI Backend
=========================
REST endpoints consumed by the React dashboard.

Endpoints:
    POST /api/query           — single question → 3-state JSON
    GET  /api/eval            — full 43-question benchmark
    GET  /api/docs/{source}   — raw document text for viewer
    GET  /api/test-set        — return test_set.json content
    GET  /api/health          — liveness check

Run locally:
    uvicorn api:app --reload --port 8000
"""

from __future__ import annotations

import json
import logging
import os
import time
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from ingest import IngestionPipeline
from engine import RegulationEngine

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── Corpus paths ──────────────────────────────────────────────────
CORPUS_DIR = Path("corpus")
PDF_PATH = str(CORPUS_DIR / "academic_handbook.pdf")
MD_FILES = [
    str(CORPUS_DIR / "hostel_rules.md"),
    str(CORPUS_DIR / "fee_deadlines.md"),
]
EXTRA_MD = [str(CORPUS_DIR / "contradictions.md")]
ALLOWED_DOCS = {
    "academic_handbook.pdf",
    "hostel_rules.md",
    "fee_deadlines.md",
    "contradictions.md",
}

# ── Global singletons (initialised at startup) ────────────────────
pipeline: IngestionPipeline | None = None
engine: RegulationEngine | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Build the index and warm up the engine on startup."""
    global pipeline, engine
    logger.info("Building ingestion pipeline…")
    pipeline = IngestionPipeline(
        pdf_path=PDF_PATH,
        md_files=MD_FILES,
        extra_md_files=EXTRA_MD,
    )
    pipeline.build_index()
    engine = RegulationEngine(pipeline)
    logger.info("Engine ready.")
    yield
    logger.info("Shutting down.")


app = FastAPI(
    title="Rulebook Engine API",
    version="1.0.0",
    description="Academic Regulation Decision Engine — 3-state classification",
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        # Add your Vercel production URL here when deploying:
        # "https://your-app.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request / Response models ─────────────────────────────────────
class QueryRequest(BaseModel):
    question: str


# ── Endpoints ─────────────────────────────────────────────────────

@app.get("/api/health")
async def health_check():
    """Liveness probe."""
    return {"status": "ok", "engine_ready": engine is not None}


@app.post("/api/query")
async def query_endpoint(request: QueryRequest):
    """
    Classify a single question into one of three states.
    Returns structured JSON matching the StateOutput schema.
    """
    if not request.question.strip():
        raise HTTPException(status_code=400, detail="Question must not be empty.")
    if engine is None:
        raise HTTPException(status_code=503, detail="Engine not yet initialised.")

    result = engine.query(request.question)
    return result.model_dump()


@app.get("/api/eval")
async def eval_endpoint(force: bool = False):
    """
    Run the full 43-question benchmark and return accuracy metrics.
    This can take several minutes — do not time out your HTTP client.
    """
    test_set_path = Path("test_set.json")
    if not test_set_path.exists():
        raise HTTPException(status_code=404, detail="test_set.json not found.")

    with open(test_set_path, encoding="utf-8") as f:
        test_data = json.load(f)

    out_path = Path("eval_results.json")
    if not force and out_path.exists():
        with open(out_path, encoding="utf-8") as f:
            cached = json.load(f)
        cached_metrics = cached.get("metrics", {})
        has_engine_errors = any(
            str(result.get("answer", "")).startswith("Error processing query:")
            for result in cached.get("results", [])
        )
        if (
            cached_metrics.get("overall", {}).get("total") == len(test_data["questions"])
            and not has_engine_errors
        ):
            return cached

    if engine is None:
        raise HTTPException(status_code=503, detail="Engine not yet initialised.")

    questions = test_data["questions"]
    counts = test_data["counts"]

    metrics: dict[str, dict] = {
        "overall": {"correct": 0, "total": len(questions)},
        "answerable": {"correct": 0, "total": counts["answerable"]},
        "near_miss": {"correct": 0, "total": counts["near_miss"]},
        "contradiction": {"correct": 0, "total": counts["contradiction"]},
    }
    results: list[dict] = []

    for q in questions:
        predicted = engine.query(q["question"])
        match = predicted.state == q["type"]

        if match:
            metrics["overall"]["correct"] += 1
            metrics[q["type"]]["correct"] += 1

        results.append(
            {
                "id": q["id"],
                "type": q["type"],
                "question": q["question"],
                "predicted_state": predicted.state,
                "match": match,
                "answer": predicted.answer,
                "confidence": predicted.confidence_score,
            }
        )
        time.sleep(0.1)  # light throttle

    output = {"metrics": metrics, "results": results}

    # Cache result to disk
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2)

    return output


@app.get("/api/docs/{source}")
async def get_document(source: str):
    """Return the full raw text of a source document."""
    if source not in ALLOWED_DOCS:
        raise HTTPException(
            status_code=404,
            detail=f"Unknown source '{source}'. Allowed: {sorted(ALLOWED_DOCS)}",
        )
    if pipeline is None:
        raise HTTPException(status_code=503, detail="Pipeline not yet initialised.")

    text = pipeline.get_document_text(source)
    return {"source": source, "text": text}


@app.get("/api/test-set")
async def get_test_set():
    """Return the test_set.json content for the frontend."""
    test_set_path = Path("test_set.json")
    if not test_set_path.exists():
        raise HTTPException(status_code=404, detail="test_set.json not found.")
    with open(test_set_path, encoding="utf-8") as f:
        return json.load(f)
