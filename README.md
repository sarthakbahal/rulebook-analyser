# Academic Regulation Decision Engine

A regulation-aware RAG system that answers questions from an academic rulebook while explicitly distinguishing between **answerable questions, unsupported/near-miss questions, and contradictory rules**.

The system combines **hybrid retrieval, evidence-grounded LLM reasoning, structured outputs, and contradiction detection** to make its decisions traceable rather than relying on unconstrained generation.

---

## Table of Contents

* [Overview](#overview)
* [Why This Project?](#why-this-project)
* [System Architecture](#system-architecture)
* [Core Components](#core-components)
* [Three-State Reasoning](#three-state-reasoning)
* [Planted Contradictions](#planted-contradictions)
* [Retrieval Pipeline](#retrieval-pipeline)
* [LLM Reasoning](#llm-reasoning)
* [Evidence and Citations](#evidence-and-citations)
* [Evaluation](#evaluation)
* [API](#api)
* [Example Query](#example-query)
* [Project Structure](#project-structure)
* [Setup and Running](#setup-and-running)
* [Design Decisions](#design-decisions)
* [Limitations](#limitations)
* [Future Improvements](#future-improvements)
* [Disclaimer](#disclaimer)

---

## Overview

The **Academic Regulation Decision Engine** is a Retrieval-Augmented Generation (RAG) system designed for querying academic regulations and institutional policies.

Instead of treating every question as a normal question-answering problem, the system makes an explicit decision about the type of information found in the rulebook. For every query, the engine attempts to determine whether the rulebook contains:

1. **An explicit rule that answers the question**
2. **No rule that directly answers the question**
3. **Two or more rules that conflict with each other**

The system therefore produces one of three states:
`ANSWERABLE` | `NEAR_MISS` | `CONTRADICTION`

The answer is generated only from the retrieved rulebook evidence, and the response contains citations pointing back to the relevant source and location.

---

## Why This Project?

Traditional RAG systems generally focus on retrieving relevant information and generating an answer. For regulatory or policy documents, however, relevance alone is not sufficient. A useful regulation-aware system must also recognize situations such as:

* The rulebook explicitly provides an answer.
* The question sounds relevant, but the rulebook does not actually specify an answer.
* Two different documents contain conflicting rules.
* The model should not invent a policy when the documents are silent.
* The model should not silently combine or reconcile contradictory rules.

This project therefore treats decision state as a first-class output of the system. The goal is not simply *"Generate the most plausible answer,"* but rather: *"Determine what the rulebook actually supports, identify the appropriate state, and provide the evidence used to reach that decision."*

---

## System Architecture

```text
                ┌──────────────────────────────┐
                │        Rulebook Corpus       │
                │                              │
                │ academic_handbook.pdf        │
                │ hostel_rules.md              │
                │ fee_deadlines.md             │
                └──────────────┬───────────────┘
                               │
                               ▼
                ┌──────────────────────────────┐
                │          Ingestion           │
                │                              │
                │ PDF / Markdown Parsing       │
                │ Chunking                     │
                │ Metadata Extraction          │
                └──────────────┬───────────────┘
                               │
                ┌──────────────┴───────────────┐
                ▼                              ▼
       ┌─────────────────┐            ┌──────────────────┐
       │  BM25 Retrieval │            │ Dense Retrieval  │
       │  Lexical Match  │            │ MiniLM Embedding │
       └────────┬────────┘            └─────────┬────────┘
                │                              │
                └──────────────┬───────────────┘
                               ▼
                     ┌──────────────────┐
                     │   RRF Fusion     │
                     │ Hybrid Retrieval │
                     └────────┬─────────┘
                              │
                              ▼
                     ┌──────────────────┐
                     │ Retrieved Context│
                     └────────┬─────────┘
                              │
                              ▼
                     ┌──────────────────┐
                     │      Groq LLM    │
                     │                  │
                     │ State Reasoning  │
                     │ Answer Generation│
                     │ Conflict Analysis│
                     └────────┬─────────┘
                              │
                              ▼
                     ┌──────────────────┐
                     │ Structured JSON  │
                     │ Pydantic Schema  │
                     └────────┬─────────┘
                              │
                    ┌─────────┴──────────┐
                    ▼                    ▼
             ┌─────────────┐      ┌─────────────┐
             │  FastAPI    │      │ React UI    │
             │     API     │      │  Interface  │
             └─────────────┘      └─────────────┘
```

---

## Core Components

| Component | Technology | Purpose |
| --- | --- | --- |
| **Document ingestion** | Python | Parse and preprocess the rulebook |
| **PDF parsing** | PyMuPDF | Extract page-level PDF text |
| **Markdown parsing** | Python | Extract structured sections |
| **Chunking** | Custom chunking | Divide documents into retrievable units |
| **Lexical retrieval** | BM25 | Capture exact terminology and keywords |
| **Dense retrieval** | Sentence Transformers | Capture semantic similarity |
| **Vector database** | Qdrant | Store and retrieve embeddings |
| **Retrieval fusion** | Reciprocal Rank Fusion | Combine lexical and semantic results |
| **LLM reasoning** | Groq API | Classify state and generate grounded responses |
| **Output validation** | Pydantic | Enforce structured response format |
| **Backend** | FastAPI | Provide API endpoints |
| **Frontend** | React | Provide an interactive interface |
| **Evaluation** | Python | Run the benchmark and measure state classification |

---

## Three-State Reasoning

The central design of the system is its three-state decision model.

### 1. ANSWERABLE

The system returns `ANSWERABLE` when the retrieved rulebook context contains an explicit rule that directly answers the question. The model should answer using the retrieved information, avoid adding unsupported assumptions, provide relevant citations, and assign a confidence score reflecting the strength of the evidence.

> **Example Query:** "What is the minimum attendance required to appear for the end-semester exam?"
> **State:** `ANSWERABLE` (Because the rulebook explicitly specifies the requirement).

### 2. NEAR_MISS

The system returns `NEAR_MISS` when the retrieved material is related to the question but does not contain an explicit rule that answers it. **Relevance does not imply that the rulebook provides an answer.** The model should not infer an answer from general knowledge; it should state that the rulebook does not explicitly specify the requested rule.

> **Example Query:** "What happens if I miss an exam because of a family wedding?"
> **State:** `NEAR_MISS` (The response explains that the available material does not specify a policy for that situation).

### 3. CONTRADICTION

The system returns `CONTRADICTION` when the retrieved evidence contains two or more rules that directly conflict with each other. The system identifies the conflicting passages, cites both sources, explains what each rule states, and clearly describes the conflict without inventing a precedence rule.

> **State:** `CONTRADICTION` (Exposes both pieces of evidence side-by-side).

---

## Planted Contradictions

The evaluation corpus contains three intentionally planted contradictions designed to test whether the system can detect conflicting regulations instead of blindly selecting one answer.

* **Contradiction 1 — Attendance vs Medical Exemption:**
  * *Rule A:* `academic_handbook.pdf` Page 4 — No exceptions to 75% attendance.
  * *Rule B:* `hostel_rules.md` Section 3.2 — Hospitalization allows eligibility at 55%.

* **Contradiction 2 — Hostel Curfew Penalty:**
  * *Rule A:* `hostel_rules.md` Section 1.4 — $50 fine for entering after 10 PM.
  * *Rule B:* `hostel_rules.md` Section 5.1 — First-time late entry results in a warning only.

* **Contradiction 3 — Library Refund Deadline:**
  * *Rule A:* `fee_deadlines.md` Table 2 — Claim within 30 days of graduation.
  * *Rule B:* `academic_handbook.pdf` Page 18 — Claims valid for up to 1 year.

---

## Retrieval Pipeline

The retrieval system uses a hybrid retrieval strategy combining **BM25** (for exact keywords like "minimum attendance") and **Dense Retrieval** (`all-MiniLM-L6-v2`, embedding dimension 384, for semantic similarity).

1. **Document Parsing:** PDF pages are parsed individually to retain metadata. Markdown files are split using structured sections.
2. **Chunking:** Chunk size of ~500 characters with 100 characters overlap.
3. **Reciprocal Rank Fusion (RRF):** Lexical and dense retrieval results are combined so passages appearing highly in multiple retrieval systems receive stronger combined scores.

---

## LLM Reasoning

After retrieval, the highest-ranked passages are provided to the Groq LLM. The reasoning layer is explicitly instructed to operate under three states and strictly follow **Grounding Rules**:

* **No hallucinated policies:** Do not invent rules.
* **No external knowledge:** Do not fill gaps using general university knowledge.
* **No silent reconciliation:** Do not decide one rule overrides another.
* **Evidence-first responses:** Answers must be based on retrieved passages with citations.

### Structured Output

The system uses a Pydantic structured response schema for stability:

```json
{
  "state": "answerable",
  "confidence_score": 0.94,
  "answer": "The minimum attendance requirement is 75%.",
  "citations": [
    {
      "source": "academic_handbook.pdf",
      "location": "Page 4",
      "quote": "75% minimum attendance is required. No exceptions are permitted."
    }
  ],
  "contradiction_detail": null,
  "contradiction_explanation": null
}
```

---

## Evaluation

The project includes a benchmark consisting of 43 evaluation questions designed to test the three-state decision system across all classification states.

| State | Questions | Description |
| --- | --- | --- |
| `answerable` | 15 | Questions with explicit answers in the corpus |
| `near_miss` | 15 | Questions the rulebook is silent on |
| `contradiction` | 13 | Questions that surface conflicting rules |
| **Total** | **43** | |

The evaluation measures **state classification accuracy** — whether the system correctly distinguishes between explicit evidence, silent rulebooks, and conflicting rules.

---

## What Is Real vs What Is Mocked

| Component | Status |
| --- | --- |
| PDF parsing | Real — `pypdf` extracts all pages from `academic_handbook.pdf` |
| Markdown parsing | Real — custom parser splits by `##` headings |
| BM25 sparse retrieval | Real — `rank_bm25.BM25Okapi` with full keyword ranking |
| Dense vector retrieval | Real — `all-MiniLM-L6-v2` (384-dim) + Qdrant |
| RRF fusion | Real — custom RRF (k=60) merging BM25 + dense rankings |
| LLM reasoning | Real — Groq API with structured JSON output |
| Schema validation | Real — Pydantic v2 `StateOutput` enforces 3-state classification |
| Corpus | **Synthetic** — derived from MIT's Mind and Hand Book, modified with planted contradictions |
| Contradictions | **Intentionally planted** — documented in `contradictions.md` |
| Test set | **Synthetic benchmark** — hand-crafted to test all 3 states |

---

## API

The backend is implemented using FastAPI.

| Method | Endpoint | Description |
| --- | --- | --- |
| `POST` | `/api/query` | Submit a question to the rulebook engine |
| `GET` | `/api/eval` | Run or expose the evaluation workflow |
| `GET` | `/api/docs/{source}` | Access source document content |
| `GET` | `/api/test-set` | Return the configured evaluation test set |

### Example: POST /api/query

```bash
curl -X POST http://localhost:8000/api/query \
  -H "Content-Type: application/json" \
  -d '{"question": "What is the minimum attendance required if I am hospitalized?"}'
```

Response:

```json
{
  "state": "contradiction",
  "confidence_score": 0.92,
  "answer": null,
  "citations": [...],
  "contradiction_detail": {
    "passage_a": "75% minimum attendance is required. No exceptions are permitted.",
    "source_a": "academic_handbook.pdf",
    "location_a": "Page 4",
    "passage_b": "Students hospitalized for more than 5 consecutive days may apply for a 20% attendance waiver, reducing the threshold to 55%.",
    "source_b": "hostel_rules.md",
    "location_b": "Section 3.2",
    "conflict_explanation": "Following both rules simultaneously is impossible when a student is hospitalized — the handbook allows no exceptions while hostel rules explicitly create one."
  },
  "contradiction_explanation": "Two rules in the corpus directly conflict on this point."
}
```

---

## Project Structure

```text
rulebook-analyser/
│
├── academic_handbook.pdf       # 20-page synthetic handbook
├── hostel_rules.md             # Synthetic hostel rules (6 sections)
├── fee_deadlines.md            # Synthetic fee schedule (tables)
│
├── contradictions.md           # Documents the planted contradictions
├── test_set.json               # 43-question benchmark
│
├── ingest.py                   # Document parsing + BM25/Qdrant indexing
├── engine.py                   # 3-state reasoning engine (Groq + Pydantic)
├── eval.py                     # CLI benchmark runner
├── api.py                      # FastAPI backend
│
├── requirements.txt
├── .env.example
├── README.md
│
├── index_data/                 # Auto-created by ingest.py
│   ├── bm25_index.pkl
│   └── qdrant/
│
└── ui/
    ├── package.json
    ├── vite.config.js
    ├── tailwind.config.js
    └── src/
        ├── App.jsx
        ├── components/
        │   ├── Header.jsx
        │   ├── QueryPanel.jsx
        │   ├── ResponseDisplay.jsx
        │   ├── StateBadge.jsx
        │   ├── CitationChip.jsx
        │   ├── DocumentInspector.jsx
        │   └── EvalModal.jsx
        └── lib/
            └── api.js
```

---

## Setup and Running

### Prerequisites

* Python 3.9+
* Node.js 18+ and npm
* A Groq API key (free at [console.groq.com](https://console.groq.com))
* Qdrant (local or [Qdrant Cloud free tier](https://cloud.qdrant.io))

### 1. Clone the Repository

```bash
git clone https://github.com/sarthakbahal/rulebook-analyser.git
cd rulebook-analyser
```

### 2. Install Python Dependencies

```bash
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 3. Configure Environment Variables

```env
GROQ_API_KEY=your_groq_api_key_here

# Optional: Qdrant Cloud
# QDRANT_URL=https://your-cluster.qdrant.io:6333
# QDRANT_API_KEY=your_qdrant_api_key_here
```

### 4. Ingest the Documents

```bash
python ingest.py
```

This parses all 3 documents, chunks them, builds BM25 + Qdrant indices, and saves to `./index_data/`.

### 5. Run the Evaluation

```bash
python eval.py
```

### 6. Start the Backend

```bash
uvicorn api:app --reload --port 8000
```

### 7. Start the Frontend

```bash
cd ui
npm install
npm run dev
```

React dashboard is live at `http://localhost:5173`.

---

## Design Decisions

* **Why Hybrid Retrieval?** Pure keyword search misses semantics; pure semantic search misses exact regulatory terminology. Combined via RRF, they provide complementary retrieval signals.
* **Why Three States?** A conventional RAG system assumes *Question → Answer*. This project models reality: *Explicit Evidence*, *Unsupported/Silent*, or *Conflicting Evidence*.
* **Why Structured Output?** Provides a stable interface between the LLM and application, making the output deterministic and renderable in the frontend.
* **Why Keep the LLM Grounded?** To prevent the language model from generating plausible but non-existent academic policies.
* **Why top_k=6 for retrieval?** Cross-document contradictions require both conflicting chunks to appear in context simultaneously. Fewer than 6 risks missing one side of the conflict.

---

## Limitations

* **Synthetic / Derived Corpus:** The corpus is synthetic/derived for the purpose of the project.
* **Retrieval Dependency:** Contradiction detection depends entirely on retrieving both conflicting passages in the same top-k window.
* **LLM Dependency:** The reasoning layer depends on an external API (Groq), making it subject to latency, rate limits, and token quotas.
* **Evaluation Scope:** The current benchmark primarily evaluates state prediction rather than independently scoring every generated answer and citation.
* **Corpus Scale:** The current retrieval system is designed for the supplied corpus. Scaling would require document versioning, access control, and policy precedence rules.

---

## Future Improvements

* Post-answer contradiction verification pass — re-retrieve against the generated answer to catch missed conflicts.
* Evidence-level evaluation and independent citation correctness scoring.
* Explicit policy precedence rules and metadata-aware retrieval.
* Document update, version management, and automated regression testing.
* Provider failover — automatic fallback to Cerebras or Together AI on Groq rate limits.

---

## Disclaimer

This project is intended as a demonstration/prototype of a regulation-aware RAG architecture. The provided rulebook corpus is synthetic/derived for evaluation purposes and should not be interpreted as official institutional policy. Some monetary values and evaluation rules are intentionally fabricated or planted to demonstrate retrieval, reasoning, and contradiction detection behaviour. The system should therefore not be used to make real academic, legal, financial, disciplinary, or institutional decisions without verification against authoritative policy documents.