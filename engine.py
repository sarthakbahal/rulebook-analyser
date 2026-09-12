import os
import json
from typing import List, Optional, Literal
from dotenv import load_dotenv
from pydantic import BaseModel, Field
from groq import Groq
from sentence_transformers import SentenceTransformer
import numpy as np
from rank_bm25 import BM25Okapi
from qdrant_client import QdrantClient
import joblib

load_dotenv()

# ======================
# CONFIGURATION
# ======================
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
QDRANT_URL = os.getenv("QDRANT_URL", "localhost:6333")
QDRANT_API_KEY = os.getenv("QDRANT_API_KEY", "")
MODEL_NAME = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")

# ======================
# PYDANTIC SCHEMAS
# ======================

class Citation(BaseModel):
    source: str = Field(description="Exact file name, e.g., academic_handbook.pdf")
    location: str = Field(description="Exact page number or section title, e.g., Page 4 or Section 3.2")
    quote: str = Field(description="Verbatim text quote from the passage")

class ContradictionDetail(BaseModel):
    passage_a: str = Field(description="verbatim quote from first conflicting source")
    source_a: str = Field(description="file and location of first passage")
    passage_b: str = Field(description="verbatim quote from second conflicting source")
    source_b: str = Field(description="file and location of second passage")
    conflict_explanation: str = Field(description="one-sentence explanation why following both is impossible")

class StateOutput(BaseModel):
    state: Literal["answerable", "near_miss", "contradiction"]
    confidence_score: float = Field(description="Confidence between 0.0 and 1.0")
    answer: Optional[str] = Field(description="Direct answer or explicit refusal")
    citations: List[Citation] = Field(default_factory=list)
    contradiction_detail: Optional[ContradictionDetail] = Field(default=None, description="Detailed conflict information")
    contradiction_explanation: Optional[str] = Field(default=None, description="Extended explanation of the contradiction")

# ======================
# UTILITY FUNCTIONS
# ======================

def groq_state_schema() -> dict:
    """Return a strict schema accepted by Groq's JSON-schema response mode."""
    citation = {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "source": {"type": "string"},
            "location": {"type": "string"},
            "quote": {"type": "string"},
        },
        "required": ["source", "location", "quote"],
    }
    contradiction_detail = {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "passage_a": {"type": "string"},
            "source_a": {"type": "string"},
            "passage_b": {"type": "string"},
            "source_b": {"type": "string"},
            "conflict_explanation": {"type": "string"},
        },
        "required": [
            "passage_a",
            "source_a",
            "passage_b",
            "source_b",
            "conflict_explanation",
        ],
    }
    return {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "state": {"type": "string", "enum": ["answerable", "near_miss", "contradiction"]},
            "confidence_score": {"type": "number"},
            "answer": {"type": ["string", "null"]},
            "citations": {"type": "array", "items": citation},
            "contradiction_detail": {"anyOf": [contradiction_detail, {"type": "null"}]},
            "contradiction_explanation": {"type": ["string", "null"]},
        },
        "required": [
            "state",
            "confidence_score",
            "answer",
            "citations",
            "contradiction_detail",
            "contradiction_explanation",
        ],
    }

def rrf_fusion(
    bm25_ranks: List[int],
    dense_ranks: List[int],
    k: int = 60,
    top_k: Optional[int] = None,
) -> List[int]:
    """Reciprocal Rank Fusion algorithm"""
    scores = {}
    for rank, idx in enumerate(bm25_ranks):
        scores[idx] = scores.get(idx, 0) + 1 / (k + rank + 1)
    for rank, idx in enumerate(dense_ranks):
        scores[idx] = scores.get(idx, 0) + 1 / (k + rank + 1)
    ranked = sorted(scores.keys(), key=lambda x: scores[x], reverse=True)
    return ranked[:top_k] if top_k is not None else ranked

# ======================
# EMBEDDING AND STORAGE
# ======================

class DocumentIndex:
    def __init__(self, pdf_path: str, md_files: List[str], qdrant_url: str = None, qdrant_api_key: str = None):
        self.pdf_path = pdf_path
        self.md_files = md_files
        self.qdrant_url = qdrant_url
        self.qdrant_api_key = qdrant_api_key
        
        # Initialize clients
        if qdrant_url and qdrant_api_key:
            self.qdrant = QdrantClient(url=qdrant_url, api_key=qdrant_api_key)
        else:
            self.qdrant = QdrantClient(path="./index_data/qdrant")  # Local persistent storage
            
        self.embedder = SentenceTransformer("all-MiniLM-L6-v2")
        self.bm25 = None
        self.collection_name = "academic_rules"
        self.dimension = 384  # all-MiniLM-L6-v2 output dim
        
    def build_index(self):
        """Parse documents, create chunks, and build BM25 + Qdrant indices"""
        # Parse PDF
        pdf_texts, pdf_metadatas = self._parse_pdf(self.pdf_path)
        
        # Parse Markdown files
        md_texts, md_metadatas = self._parse_markdowns(self.md_files)
        
        # Combine and chunk
        all_texts = pdf_texts + md_texts
        all_metadatas = pdf_metadatas + md_metadatas
        
        # Chunking
        chunks, chunk_metadatas = self._chunk_texts(all_texts, all_metadatas)
        
        # Build BM25 index
        tokenized = [chunk.lower().split() for chunk in chunks]
        self.bm25 = BM25Okapi(tokenized)
        joblib.dump({"bm25": self.bm25, "chunks": chunks, "metadatas": chunk_metadatas}, 
                   "./index_data/bm25_index.pkl")
        
        # Build Qdrant index
        self._build_qdrant_index(chunks, chunk_metadatas)
    
    def _parse_pdf(self, path: str):
        """Extract text from PDF with page metadata"""
        from pypdf import PdfReader
        reader = PdfReader(path)
        texts, metadatas = [], []
        for i, page in enumerate(reader.pages):
            text = page.get_text()
            texts.append(text.strip())
            metadatas.append({
                "source": os.path.basename(path),
                "location": f"Page {i+1}"
            })
        return texts, metadatas
    
    def _parse_markdowns(self, files: List[str]):
        """Parse markdown files by sections"""
        texts, metadatas = [], []
        for file in files:
            with open(file, 'r', encoding='utf-8') as f:
                lines = f.readlines()
            
            current_section = "General"
            for i, line in enumerate(lines):
                if line.strip().startswith("## "):
                    current_section = line.strip().replace("## ", "")
                text = line.strip()
                if text:
                    texts.append(text)
                    metadatas.append({
                        "source": os.path.basename(file),
                        "location": f"Section {current_section}"
                    })
        return texts, metadatas
    
    def _chunk_texts(self, texts: List[str], metadatas: List[dict], chunk_size: int = 500, overlap: int = 100):
        """Split texts into overlapping chunks"""
        chunks, chunk_metadatas = [], []
        for i, text in enumerate(texts):
            if len(text) <= chunk_size:
                chunks.append(text)
                chunk_metadatas.append(metadatas[i])
            else:
                start = 0
                while start < len(text):
                    end = min(start + chunk_size, len(text))
                    chunk = text[start:end]
                    chunks.append(chunk)
                    chunk_metadatas.append(metadatas[i])
                    start += end - overlap  # Move forward with overlap
        return chunks, chunk_metadatas
    
    def _build_qdrant_index(self, texts: List[str], metadatas: List[dict]):
        """Create Qdrant collection with vector embeddings"""
        # Create collection if it doesn't exist
        try:
            self.qdrant.re_create_collection(
                collection_name=self.collection_name,
                vectors_config={"size": self.dimension, "distance": "Cosine"}
            )
        except Exception:
            pass  # Collection already exists
        
        # Encode texts
        embeddings = self.embedder.encode(texts).tolist()
        
        # Prepare points
        points = [
            {
                "id": str(i),
                "vector": embeddings[i],
                "payload": {
                    "text": texts[i],
                    "source": metadatas[i]["source"],
                    "location": metadatas[i]["location"]
                }
            }
            for i in range(len(texts))
        ]
        
        # Upload points
        self.qdrant.upload_points(
            collection_name=self.collection_name,
            points=points
        )
    
    def retrieve(self, query: str, top_k: int = 6) -> List[dict]:
        """Hybrid retrieval using RRF fusion"""
        # BM25 retrieval
        if self.bm25 is None:
            return []
        bm25_indices = self.bm25.search(query, top_k * 2)  # Get more candidates
        
        # Dense retrieval
        query_embedding = self.embedder.encode([query]).tolist()[0]
        search_result = self.qdrant.search(
            collection_name=self.collection_name,
            query_vector=query_embedding,
            limit=top_k * 2
        )
        dense_indices = [hit.id for hit in search_result]
        
        # RRF fusion
        fused_indices = rrf_fusion(bm25_indices, dense_indices, k=60, top_k=top_k)
        fused_results = []
        for idx in fused_indices:
            if idx < len(self._chunks):
                result = self._chunks[idx].copy()
                result["score"] = 1.0
                result["id"] = idx
                fused_results.append(result)
        return fused_results[:top_k]
    
    @property
    def _chunks(self):
        """Lazily load chunks from index"""
        if not hasattr(self, '_loaded_chunks'):
            with open("./index_data/bm25_index.pkl", "rb") as f:
                data = joblib.load(f)
            self._loaded_chunks = data["chunks"]
        return self._loaded_chunks

# ======================
# REGULATION ENGINE
# ======================

class RegulationEngine:
    def __init__(self, index: DocumentIndex):
        self.index = index
        self.groq_client = Groq(api_key=GROQ_API_KEY)
        self.model = MODEL_NAME
        self.system_prompt = """You are a strict Academic Regulation Decision Engine. 
You MUST classify every query into exactly one of three states:

STATE 1 — ANSWERABLE: The retrieved context contains explicit information directly answering the query.
- Provide the exact answer verbatim from the context.
- Include citations with source file, page/section, and verbatim quote.
- Set confidence_score between 0.7 and 1.0.

STATE 2 — NEAR_MISS (UNANSWERABLE): The retrieved context does NOT contain explicit rules answering the query.
- Do NOT speculate, infer, or use external knowledge.
- Explicitly state the rulebook is silent on this specific scenario.
- Set confidence_score between 0.8 and 0.95.

STATE 3 — CONTRADICTION: The context contains two or more conflicting clauses regarding the query.
- Extract BOTH conflicting statements VERBATIM.
- Identify which two passages conflict directly.
- Explain precisely why following both rules simultaneously is impossible.
- Cite both sources with file, page/section, and quote.
- Set confidence_score between 0.85 and 1.0.

CRITICAL RULES:
- NEVER invent information not present in the context.
- NEVER merge or reconcile contradictions — surface both sides.
- ALWAYS return valid JSON matching the schema.
- For contradictions, you MUST provide a ContradictionDetail with both passages and conflict explanation.
- If the context is empty or irrelevant, classify as NEAR_MISS.

When retrieving passages, ALWAYS retrieve at least 6 passages to ensure cross-document contradictions can be detected.
"""
    
    def query(self, question: str) -> StateOutput:
        # Step 1: Retrieve top 6 passages (updated requirement)
        passages = self.index.retrieve(question, top_k=6)
        if not passages:
            # Handle empty retrieval
            return StateOutput(
                state="near_miss",
                confidence_score=0.85,
                answer="The rulebook appears to be silent on this specific scenario.",
                citations=[]
            )
        
        # Step 2: Format passages for LLM
        formatted_passages = "\n".join([
            f"[{i+1}] Source: {p['source']} | Location: {p['location']}\n\"{p['text']}\"\n{p['score']:.3f}"
            for i, p in enumerate(passages)
        ])
        
        # Step 3: LLM call with structured output
        try:
            response = self.groq_client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": self.system_prompt},
                    {"role": "user", "content": f"CONTEXT:\n{formatted_passages}\n\nQUESTION: {question}"}
                ],
                response_format={
                    "type": "json_schema",
                    "json_schema": {
                        "name": "StateOutput",
                        "strict": True,
                        "schema": groq_state_schema()
                    }
                },
                temperature=0.0
            )
            
            result_json = json.loads(response.choices[0].message.content)
            result = StateOutput(**result_json)
            
            # Process for contradiction detail extraction
            if (
                result.state == "contradiction" 
                and result.contradiction_detail is None 
                and result.citations and len(result.citations) >= 2
            ):
                # Try to extract conflict info from citations if not provided
                cite1, cite2 = result.citations[0], result.citations[1]
                conflict_explanation = f"Rules conflict: '{cite1.quote[:50]}...' vs '{cite2.quote[:50]}...'"
                
                # Create detailed contradiction information
                result.contradiction_detail = ContradictionDetail(
                    passage_a=cite1.quote,
                    source_a=f"{cite1.source} ({cite1.location})",
                    passage_b=cite2.quote,
                    source_b=f"{cite2.source} ({cite2.location})",
                    conflict_explanation=conflict_explanation
                )
            
            return result
            
        except Exception as e:
            # Fallback to near_miss on any error
            return StateOutput(
                state="near_miss",
                confidence_score=0.85,
                answer=f"Error processing query: {str(e)}",
                citations=[]
            )

# ======================
# QUICK START FUNCTION
# ======================

def main():
    """For testing the engine directly"""
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--question", type=str, help="Question to ask the engine")
    args = parser.parse_args()
    
    if not args.question:
        print("Please provide a --question")
        return
    
    # Initialize index
    index = DocumentIndex(
        pdf_path="academic_handbook.pdf",
        md_files=["hostel_rules.md", "fee_deadlines.md"]
    )
    index.build_index()
    
    # Initialize engine
    engine = RegulationEngine(index)
    
    # Query
    result = engine.query(args.question)
    print(json.dumps(result.model_dump(), indent=2))

if __name__ == "__main__":
    main()