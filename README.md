# Rulebook Engine

> Academic Regulation Decision Engine — a deterministic 3-state reasoning system that ingests a synthetic MIT regulation corpus, retrieves relevant passages via hybrid search (BM25 + Qdrant with RRF fusion), and classifies queries as **answerable**, **near_miss** (unanswerable), or **contradiction** with detailed conflict reporting.

---

## What Is Real vs What Is Mocked

### Real (Production-Grade)

| Component | Status |
|---|---|
| PDF parsing | `pypdf` extracts all pages from `academic_handbook.pdf` |
| Markdown parsing | Custom parser splits `hostel_rules.md` and `fee_deadlines.md` by `## ` headings |
| Document chunking | `RecursiveCharacterTextSplitter` — 500 chars, 100 overlap, page/section metadata |
| BM25 sparse retrieval | `rank_bm25.BM25Okapi` — full keyword-based ranking |
| Dense vector retrieval | `sentence-transformers/all-MiniLM-L6-v2` (384-dim) + `qdrant-client` |
| Reciprocal Rank Fusion | Custom RRF (k=60) merging BM25 + dense rankings |
| LLM reasoning | Groq API (`llama-3.3-70b-versatile` or configurable) with structured JSON output |
| Schema validation | Pydantic v2 `StateOutput` model — enforces 3-state classification |
| FastAPI backend | 4 REST endpoints (`/api/query`, `/api/eval`, `/api/docs/{source}`, `/api/test-set`) |
| React dashboard | Vite + Tailwind dark theme, split-screen layout, eval modal |
| Benchmark evaluation | Automated runner with per-question accuracy metrics |
| Citation system | Verbatim quotes with source file + page/section location |

### Mocked / Synthetic

| Component | Details |
|---|---|
| **Corpus** | All 3 document files (`academic_handbook.pdf`, `hostel_rules.md`, `fee_deadlines.md`) are **synthetic** — derived from MIT's Mind and Hand Book but modified with deliberately planted contradictions. Not official MIT policy. |
| **Contradictions** | The 10 contradictions (attendance, library refund, late entry fine, exam re-sit, scholarship GPA, plagiarism first offense, hostel guest policy, medical certificate deadline) are **intentionally planted** for testing contradiction detection. They are documented implicitly in the source files and explicitly in `contradictions.md`. |
| **Fee schedule** | All dollar amounts in `fee_deadlines.md` are **fabricated** (tuition $31,250, hostel $8,400, etc.). The real MIT handbook does not contain these numbers. |
| **Test set** | `test_set.json` is a **synthetic benchmark** — 25 hand-crafted questions designed to test all 3 states. Not derived from real student queries. |
| **LLM provider** | Uses Groq's free tier — subject to rate limits. In production, swap to a paid plan or different provider. |
| **Embeddings** | `all-MiniLM-L6-v2` runs locally on CPU — adequate for ~50 chunks but not for production-scale corpora. |

---

## Architecture

```
academic_handbook.pdf ─┐
hostel_rules.md ───────┤──► ingest.py ──► BM25 + Qdrant index
fee_deadlines.md ──────┘                        │
                                                ▼
user query ──────────────────────────► engine.py (RRF → Groq → Pydantic)
                                                │
                                    ┌───────────┼───────────┐
                                    ▼           ▼           ▼
                                eval.py     api.py      React UI
                              (25 Q benchmark)  (FastAPI)  (Vite + Tailwind)
```

---

## Prerequisites

- **Python 3.11+**
- **Node.js 18+** (for React frontend)
- **Groq API key** — free at [console.groq.com](https://console.groq.com)
- **Qdrant** — either local (no setup needed) or Qdrant Cloud free tier

---

## Quick Start

### 1. Clone and enter the project

```bash
cd itg
```

### 2. Set up Python environment

```bash
python -m venv venv
# Windows
venv\Scripts\activate
# macOS/Linux
source venv/bin/activate

pip install -r requirements.txt
```

### 3. Configure environment variables

Create a `.env` file in the project root:

```env
GROQ_API_KEY=gsk_your_groq_api_key_here

# Optional: Qdrant Cloud (omit for local persistent storage)
# QDRANT_URL=https://your-cluster.qdrant.io:6333
# QDRANT_API_KEY=your_qdrant_api_key_here
```

### 4. Build the search index

```bash
python ingest.py
```

This parses all 3 documents, chunks them, builds BM25 + Qdrant indices, and saves to `./index_data/`.

### 5. Run the benchmark evaluation

```bash
python eval.py
```

Runs all 25 questions from `test_set.json` against the engine and prints accuracy metrics to the terminal.

### 6. Start the API server

```bash
uvicorn api:app --reload --port 8000
```

API is live at `http://localhost:8000`. Docs at `http://localhost:8000/docs`.

### 7. Start the React frontend

```bash
cd ui
npm install
npm run dev
```

React dashboard is live at `http://localhost:5173` with API proxy to `localhost:8000`.

---

## Running Individual Components

### Query the engine directly (Python)

```python
from ingest import IngestionPipeline
from engine import RegulationEngine

pipeline = IngestionPipeline(
    pdf_path="academic_handbook.pdf",
    md_files=["hostel_rules.md", "fee_deadlines.md"]
)
pipeline.build_index()

engine = RegulationEngine(pipeline)
result = engine.query("What is plagiarism?")
print(result.state)       # "answerable"
print(result.answer)      # Direct answer text
print(result.citations)   # List of Citation objects
```

### Test specific states

| Query | Expected State |
|---|---|
| "What is plagiarism under MIT guidelines?" | `answerable` |
| "What happens if I miss an exam for a family wedding?" | `near_miss` |
| "What is the minimum attendance required if hospitalized?" | `contradiction` |

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/query` | Send a question, get 3-state classification |
| `GET` | `/api/eval` | Run full 25-question benchmark |
| `GET` | `/api/docs/{source}` | Get raw text of a source document |
| `GET` | `/api/test-set` | Get the test_set.json content |

### Example: POST /api/query

```bash
curl -X POST http://localhost:8000/api/query \
  -H "Content-Type: application/json" \
  -d '{"question": "What is plagiarism?"}'
```

Response:

```json
{
  "state": "answerable",
  "confidence_score": 0.95,
  "answer": "Plagiarism is the appropriation of another person's ideas, words, processes, results, assertions, data, or figures without giving appropriate credit or acknowledging the source.",
  "citations": [
    {
      "source": "academic_handbook.pdf",
      "location": "Page 6",
      "quote": "Plagiarism is the appropriation of another person's ideas, words, processes, results, assertions, data, or figures without giving appropriate credit or acknowledging that one has done so."
    }
  ],
  "contradiction_detail": null,
  "contradiction_explanation": null
}
```

For contradiction queries, the response will include a populated `contradiction_detail` object with `passage_a`, `source_a`, `location_a`, `passage_b`, `source_b`, `location_b`, and `conflict_explanation`.

---

## Project Structure

```
itg/
├── academic_handbook.pdf       # Synthetic MIT handbook (with 10 planted contradictions)
├── hostel_rules.md             # Synthetic hostel rules (with contradictions)
├── fee_deadlines.md            # Synthetic fee schedule (with contradictions)
├── contradictions.md           # Documents the planted contradictions
├── test_set.json               # 25-question benchmark (10 answerable, 5 near_miss, 10 contradiction)
│
├── .env                        # API keys (not committed)
├── .gitignore                  # Ignores .env, __pycache__, node_modules, index_data/
├── requirements.txt            # Python dependencies
│
├── ingest.py                   # Document parsing + BM25/Qdrant indexing + RRF retrieval
├── engine.py                   # 3-state reasoning engine (Groq + Pydantic)
├── eval.py                     # CLI benchmark runner
├── api.py                      # FastAPI backend
│
├── plan.md                     # Full architecture documentation
├── README.md                   # This file
│
├── index_data/                 # Auto-created by ingest.py
│   ├── bm25_index.pkl          # BM25 index + chunk metadata
│   └── qdrant/                 # Qdrant persistent storage
│
└── ui/                         # React frontend
    ├── package.json
    ├── vite.config.js
    ├── tailwind.config.js
    ├── postcss.config.js
    ├── index.html
    └── src/
        ├── main.jsx
        ├── App.jsx
        ├── index.css
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

## The 10 Planted Contradictions

| # | Topic | Source A | Source B |
|---|---|---|---|
| 1 | **Attendance rule** | `academic_handbook.pdf` Page 4: "75% minimum, no exceptions" | `hostel_rules.md` Section 3.2: "Hospitalization waives 20%, eligibility at 55%" |
| 2 | **Library refund deadline** | `fee_deadlines.md` Table 2: "Within 30 days of graduation" | `academic_handbook.pdf` Page 18: "Valid for up to 1 year post-graduation" |
| 3 | **Hostel late-entry penalty** | `hostel_rules.md` Section 1.4: "$50 fine for any late entry" | `hostel_rules.md` Section 5.1: "First offense = warning only, fines from 2nd" |
| 4 | **Exam re-sit policy** | `academic_handbook.pdf` (exam policies): "One re-sit per academic year maximum" | `fee_deadlines.md` (re-sit policy): "Re-sit fee applies per attempt, unlimited attempts within the semester" |
| 5 | **Scholarship GPA** | `academic_handbook.pdf` (general section): "Academic good standing requires 3.0 GPA only" | `academic_handbook.pdf` (scholarship policy): "Maintain 3.5 GPA for scholarship eligibility" |
| 6 | **Plagiarism first offense** | `academic_handbook.pdf` Chapter 3: "First offense: written warning" | `academic_handbook.pdf` Appendix B: "First offense: automatic F on the assignment" |
| 7 | **Hostel guest policy** | `hostel_rules.md` Section 2: "Guests allowed until 10pm" | `hostel_rules.md` Section 6 (festival/events): "Guests may stay overnight during designated institute events" |
| 8 | **Medical certificate deadline** | `academic_handbook.pdf` (return procedures): "Submit within 3 days of return" | `hostel_rules.md` (medical documentation): "Must be submitted within 7 days" |
| 9 | **(Duplicate test of #1)** | Same as #1 | Same as #1 |
| 10| **(Duplicate test of #2)** | Same as #2 | Same as #2 |

*Note: Contradictions #9 and #10 are indirect/roundabout questions that test the same underlying conflicts as #1 and #2 but phrased as real-world student scenarios.*

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GROQ_API_KEY` | Yes | Groq API key for LLM inference |
| `QDRANT_URL` | No | Qdrant Cloud URL (omit for local storage) |
| `QDRANT_API_KEY` | No | Qdrant Cloud API key (omit for local storage) |

---

## Deployment

### Frontend (Vercel)

```bash
cd ui
npm run build
# Deploy ./dist to Vercel
```

Set `CORS_ORIGINS` on the backend to your Vercel URL.

### Backend (Render / Railway)

Push the Python files. Set environment variables in the dashboard:
- `GROQ_API_KEY`
- `QDRANT_URL` (if using Qdrant Cloud)
- `QDRANT_API_KEY` (if using Qdrant Cloud)

### Vector DB (Qdrant Cloud Free Tier)

1. Create account at [cloud.qdrant.io](https://cloud.qdrant.io)
2. Create a free cluster (1GB RAM, 0.5 vCPU, 4GB disk)
3. Copy the cluster URL and API key to your `.env`

---

## Troubleshooting

| Issue | Fix |
|---|---|
| `ModuleNotFoundError: No module named 'pypdf'` | Run `pip install -r requirements.txt` |
| `groq.AuthenticationError` | Check your `GROQ_API_KEY` in `.env` |
| `ConnectionRefusedError` on `/api/query` | Start FastAPI: `uvicorn api:app --reload --port 8000` |
| React shows "Failed to fetch" | Ensure FastAPI is running on port 8000 |
| Qdrant connection error | Either omit `QDRANT_URL` for local mode, or check your Qdrant Cloud credentials |
| Benchmark accuracy is low | Rebuild index: delete `index_data/` and run `python ingest.py` again |
| LLM returns JSON schema error | Ensure you're using the latest `engine.py` with fixed `ContradictionDetail` schema |
| UI not showing contradiction details | Check that `ResponseDisplay.jsx` uses `location_a`/`location_b` from `contradiction_detail` |

---