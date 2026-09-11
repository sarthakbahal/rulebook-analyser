"""
engine.py — 3-State Reasoning Engine (Groq + Pydantic)
=======================================================
Uses the Groq API with JSON mode to classify
every query into exactly one of three states:

    ANSWERABLE   — The corpus explicitly answers the query.
    NEAR_MISS    — The corpus is silent; refusal to speculate.
    CONTRADICTION — Two or more conflicting clauses detected.

Usage:
    from ingest import IngestionPipeline
    from engine import RegulationEngine

    pipeline = IngestionPipeline(...)
    pipeline.build_index()
    engine = RegulationEngine(pipeline)
    result = engine.query("What is the minimum attendance requirement?")
    print(result.state, result.answer)
"""

from __future__ import annotations

import json
import logging
import time
from typing import List, Literal, Optional

from groq import Groq
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

# ── Pydantic Schema ────────────────────────────────────────────────

class Citation(BaseModel):
    source: str = Field(description="Exact file name, e.g. academic_handbook.pdf")
    location: str = Field(description="Exact page or section, e.g. Page 4 or Section 3.2")
    quote: str = Field(description="Verbatim text quote from the passage (max ~200 chars)")


class StateOutput(BaseModel):
    state: Literal["answerable", "near_miss", "contradiction"]
    confidence_score: float = Field(
        description="Confidence between 0.0 and 1.0"
    )
    answer: str = Field(
        description="Direct precise answer, or explicit refusal statement if near_miss"
    )
    citations: List[Citation] = Field(default_factory=list)
    contradiction_explanation: Optional[str] = Field(
        default=None,
        description="Side-by-side conflict explanation when state is 'contradiction'",
    )


# ── System Prompt ─────────────────────────────────────────────────
SYSTEM_PROMPT = """You are a strict Academic Regulation Decision Engine.
Your sole task is to evaluate a user QUESTION against the CONTEXT passages retrieved
from a corpus of institutional documents (academic_handbook.pdf, hostel_rules.md, fee_deadlines.md).

You MUST classify every query into EXACTLY ONE of the following three states:

────────────────────────────────────────────────────────
STATE 1 — "answerable"
The retrieved CONTEXT contains EXPLICIT information that directly and completely answers the query.
• Extract the exact answer verbatim from the context — do NOT paraphrase or infer.
• Include citations: source file, page/section, and verbatim quote.
• Set confidence_score between 0.7 and 1.0.
• Leave contradiction_explanation as null.

STATE 2 — "near_miss"
The retrieved CONTEXT does NOT contain explicit rules or facts answering the query.
The rulebook is SILENT on this topic.
• Do NOT speculate, infer, guess, or use external knowledge.
• State clearly that the rulebook does not address this topic.
• Include no citations (empty array).
• Set confidence_score between 0.8 and 0.95.
• Leave contradiction_explanation as null.

STATE 3 — "contradiction"
The retrieved CONTEXT contains TWO OR MORE clauses that DIRECTLY CONFLICT with each other
regarding the same policy or rule.
• Extract BOTH conflicting statements VERBATIM as separate citations.
• Cite each with its source file, page/section, and verbatim quote.
• Provide contradiction_explanation describing the exact conflict in plain language.
• Set confidence_score between 0.85 and 1.0.
────────────────────────────────────────────────────────

CRITICAL RULES — violations are unacceptable:
1. Never invent, assume, or infer information not present in the CONTEXT.
2. Never merge, reconcile, or paper over contradictions — always surface BOTH clauses.
3. If the CONTEXT is empty, irrelevant, or only tangentially related → classify as "near_miss".
4. Always return valid JSON exactly matching the required schema.
5. Verbatim quotes must be taken directly from the provided passage text.
6. Keep quotes concise (under 200 characters each) while preserving the key clause."""


# ── Groq JSON Schema (derived from Pydantic model) ────────────────
def _build_json_schema() -> dict:
    """Manually construct the JSON schema for Groq's json_schema response format."""
    return {
        "name": "StateOutput",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "state": {
                    "type": "string",
                    "enum": ["answerable", "near_miss", "contradiction"],
                    "description": "Classification state"
                },
                "confidence_score": {
                    "type": "number",
                    "description": "Confidence between 0.0 and 1.0"
                },
                "answer": {
                    "type": "string",
                    "description": "Direct answer or explicit refusal"
                },
                "citations": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "source": {"type": "string"},
                            "location": {"type": "string"},
                            "quote": {"type": "string"}
                        },
                        "required": ["source", "location", "quote"],
                        "additionalProperties": False
                    }
                },
                "contradiction_explanation": {
                    "type": ["string", "null"],
                    "description": "Conflict explanation for contradiction state"
                }
            },
            "required": ["state", "confidence_score", "answer", "citations", "contradiction_explanation"],
            "additionalProperties": False
        }
    }


# ── Regulation Engine ──────────────────────────────────────────────

class RegulationEngine:
    """
    3-state reasoning engine backed by Groq.
    Uses hybrid retrieval from IngestionPipeline + Groq JSON mode.
    """

    def __init__(
        self,
        pipeline,  # IngestionPipeline instance
        model: str | None = None,
        max_retries: int = 3,
        retry_delay: float = 2.0,
    ):
        import os
        from dotenv import load_dotenv
        load_dotenv()

        self.pipeline = pipeline
        self.model = model or os.environ.get("GROQ_MODEL", "openai/gpt-oss-120b")
        self.max_retries = max_retries
        self.retry_delay = retry_delay
        self._groq = Groq(api_key=os.environ.get("GROQ_API_KEY"))
        self._schema = _build_json_schema()

    def query(self, question: str, top_k: int = 8) -> StateOutput:
        """
        Full pipeline:
        1. Hybrid retrieval (BM25 + Qdrant → RRF)
        2. Groq structured output (JSON mode)
        3. Pydantic validation
        Returns a StateOutput object.
        """
        chunks = self.pipeline.retrieve(question, top_k=top_k)
        context = self._format_passages(chunks)

        for attempt in range(1, self.max_retries + 1):
            try:
                response = self._groq.chat.completions.create(
                    model=self.model,
                    messages=[
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {
                            "role": "user",
                            "content": f"CONTEXT:\n{context}\n\nQUESTION: {question}",
                        },
                    ],
                    response_format={
                        "type": "json_schema",
                        "json_schema": self._schema,
                    },
                    temperature=0.0,
                    max_tokens=1024,
                )
                raw = response.choices[0].message.content
                data = json.loads(raw)
                return StateOutput(**data)

            except Exception as exc:
                logger.warning("Groq attempt %d/%d failed: %s", attempt, self.max_retries, exc)
                if attempt < self.max_retries:
                    time.sleep(self.retry_delay * attempt)
                else:
                    # Graceful degradation: return near_miss with error info
                    return StateOutput(
                        state="near_miss",
                        confidence_score=0.0,
                        answer=f"Engine error after {self.max_retries} attempts: {exc}",
                        citations=[],
                        contradiction_explanation=None,
                    )

    # ── Private helpers ────────────────────────────────────────────

    @staticmethod
    def _format_passages(chunks: list[dict]) -> str:
        """Format retrieved chunks as numbered passages with metadata."""
        if not chunks:
            return "[No relevant passages retrieved from the corpus.]"
        lines: list[str] = []
        for i, chunk in enumerate(chunks, 1):
            lines.append(
                f"[{i}] Source: {chunk['source']} | Location: {chunk['location']}"
            )
            lines.append(f'"{chunk["text"]}"')
            lines.append("")
        return "\n".join(lines)
