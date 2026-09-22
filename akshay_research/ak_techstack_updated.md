# GroundingGuard — Updated Production Tech Stack & Execution Workflow

## 1\. System-Wide & RAG Tech Stack Specification

\[ CLIENT / PRESENTATION TIER \]

• Next.js 14/15 (App Router) • TypeScript • Tailwind CSS • shadcn/ui

• Server-Sent Events (SSE) Client • Recharts (Evaluation & Metrics)

&nbsp;

\[ API GATEWAY & ORCHESTRATION \]

• Node.js (v20+) • Fastify Engine • TypeScript • Prisma ORM • Zod Validation

• PostgreSQL 16 (Relational: Users, Projects, Request Logs, Audits)

• Redis 7 (Session Cache & Streaming Token Queues)

&nbsp;

\[ UNIFIED AI & GROUNDING ENGINE (Python 3.11) \]

• Runtime & Web:        FastAPI • Uvicorn • Pydantic v2 • HTTPX

• Document Ingestion:    PyMuPDF4LLM (C++ native engine) \+ pdfplumber Stream Mode

• Knowledge Storage:     Embedded LanceDB (Apache Arrow zero-copy NVMe reads) \+ Tantivy BM25

• Query Routing:         CPU Non-LLM Classifier (Regex pre-filter \+ BGE embeddings)

• Context Reranking:     FlashRank (MiniLM Cross-Encoder) with Adaptive Reranker Bypass

• Agentic Orchestration: LangGraph 11-node dual-spine StateGraph with custom reducers

• Claim Segmentation:    SpaCy (en\_core\_web\_sm)

• Guardrail Tier 1:      Pint Engine (Deterministic Symbolic Physics & Unit Solver)

• Guardrail Tier 2:      DeBERTa-v3-base via ONNX Runtime (CPU, INT8 Dynamic Quantization)

• Generative Model:      Google Gemini 1.5 Flash (Cloud API) / Meta-Llama-3.1-8B (Local)

---

## 2\. Machine Learning Model Inventory

| Model Name | Model Type | Parameters | Primary Function |
| :---- | :---- | :---- | :---- |
| **`BAAI/bge-small-en-v1.5`** | Dense Bi-Encoder | 33M (384-dim) | Converts queries and chunks into dense vectors for semantic retrieval. |
| **`FlashRank`** | Lightweight Cross-Encoder | 22M | Reranks top-15 candidate chunks down to top-3 high-precision context snippets. |
| **`Gemini 1.5 Flash`** | Autoregressive LLM | Frontier API | Generates draft responses and executes single-sentence repairs in LangGraph. |
| **`DeBERTa-v3-base`** | Disentangled Cross-Encoder | 86M backbone | Evaluates `[CLS] Chunk [SEP] Claim [SEP]` for factual entailment (\<25 ms on CPU). |
| **`Pint Engine`** | Symbolic Physics Solver | Deterministic Code | Enforces mathematical and unit consistency (e.g., psig vs. psia, bar vs. kPa). |

---

## 3\. End-to-End Execution Workflows

### Workflow A: Ingestion & Knowledge Indexing (Write Path)

1. **Upload:** User uploads PDF, TXT, or Markdown documents via Next.js.  
2. **C++ Parsing:** `PyMuPDF4LLM` extracts text and tables directly on CPU in \<15 ms per page with 0 MB GPU VRAM.  
3. **Table Unit Inheritance:** Global footnote units (e.g., *"All pressures in barg"*) are injected into individual table cells.  
4. **Lineage Breadcrumbs:** Prepends `[Doc > Section > Unit | Rev: ACTIVE]` into each chunk header.  
5. **Tag Protection:** Alphanumeric IDs and equipment codes are pre-tokenized into a synthetic column (`P_101A_M`) to prevent tokenizer fragmentation.  
6. **Zero-Copy Persistence:** Embeddings and raw text are committed to embedded **LanceDB** on NVMe using Apache Arrow memory-mapping.

---

### Workflow B: Query, Streaming Guardrail & Recovery (Read Path)

User Query ──► \[Node.js Gateway\] ──► \[FastAPI Python Engine\]

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;│

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;┌───────────────────────────────────┴───────────────────────────────────┐

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;▼                                                                       ▼

\[Exact Tag Match \>= 0.95\]                                           \[Conceptual Query\]

Tantivy BM25 (Bypass Reranker: \-400ms)                              LanceDB Dense \+ Sparse Search

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;│                                                                       │

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;└───────────────────────────────┬───────────────────────────────────────┘

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;▼

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;\[FlashRank Reranking\]

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;▼

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Top-3 Authoritative Chunks

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;▼

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;\[Gemini 1.5 Flash Token Stream\]

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;▼

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;\[1-Sentence Emission Delay Buffer\]

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;│

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Sentence N arrives in buffer

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;│

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;┌───────────────────────────┴───────────────────────────┐

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;▼                                                       ▼

&nbsp;&nbsp;\[Symbolic Pint Check\]                                 \[DeBERTa-v3 ONNX CPU\]

&nbsp;&nbsp;Validates units & math                                Computes entailment score

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;│                                                       │

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;└───────────────────────────┬───────────────────────────┘

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;▼

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Verification Verdict

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;/         \\

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;PASS           FAIL (Contradiction)

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;/                 \\

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;▼                   ▼

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;\[Flush to User Screen\]   \[LangGraph Surgical Repair\]

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"Claim text \[✓ 0.98\]"    Prompt: "Claim conflicts with chunk.

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Rewrite only this sentence."

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;│

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Re-verify repaired sentence

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;│

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;▼

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;\[Flush to User Screen\]

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"Repaired text \[✓ Recovered 0.96\]"

---

## 4\. Practical Scenario Walkthrough

* **Source Document Chunk:**  
  *"AeroMobility Falcon-X: Net profit reached ₹120 Cr, representing a 15% increase YoY. Operating pressure is 14 barg."*  
* **LLM Draft Output:**  
  * $S\_1$: *"AeroMobility reported a net profit of ₹120 Cr."*  
  * $S\_2$: *"Profit surged by 45% compared to last year."* *(Hallucination: 45% vs 15%)*  
  * $S\_3$: *"Operating pressure is maintained at 14 barg."*  
* **Execution Trace:**  
  1. $S\_1$ enters buffer $\\rightarrow$ Pint passes $\\rightarrow$ DeBERTa score **0.98** $\\rightarrow$ **Emitted immediately** to client.  
  2. $S\_2$ enters buffer $\\rightarrow$ DeBERTa detects contradiction (score **0.04**) $\\rightarrow$ **Blocked in-flight**.  
  3. LangGraph invokes repair node: *"Rewrite $S\_2$ using evidence '15% increase YoY'."*  
  4. Repaired $S\_2$: *"Profit increased by 15% year-over-year."* $\\rightarrow$ DeBERTa re-score **0.96** $\\rightarrow$ **Emitted** with recovery badge.  
  5. $S\_3$ enters buffer $\\rightarrow$ Pint confirms 14 barg $\\rightarrow$ DeBERTa score **0.97** $\\rightarrow$ **Emitted immediately**.

---

## 5\. Hardware & Mobile Device Profile

* **Server Resource Footprint:**  
  * CPU Usage: 2–4 cores burst during verification (\<25 ms per forward pass).  
  * Host RAM: \~1.5 GB total for embedded LanceDB, Tantivy, and ONNX workers.  
  * GPU Allocation: **0 MB VRAM** required for ingestion, vector search, and guardrail verification.  
* **Mobile Client Profile:**  
  * Consumes \<5% CPU; acts strictly as an SSE listener and lightweight React DOM renderer.  
  * Bandwidth: Low-overhead text streaming (\~2 KB/s) with zero client-side battery drain.