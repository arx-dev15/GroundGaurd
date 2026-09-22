# GroundingGuard — Master Production Architecture, Workflow & Engineering Defense

## 1\. The Master Production Tech Stack

\[ PRESENTATION & CLIENT TIER \]

• Framework:      Next.js 14/15 (App Router) • TypeScript • Tailwind CSS • shadcn/ui

• Event Stream:   Server-Sent Events (SSE) Client with monotonic sequence reconnection

• Observability:  Recharts (AI Reliability, Grounding Rates & Latency Analytics)

• Client Profile: Zero flash-storage persistence; lightweight DOM renderer (\<5% mobile CPU)

&nbsp;

\[ API GATEWAY & DATA TIER \]

• Web Gateway:    Node.js (v20+) • Fastify Engine • TypeScript • Prisma ORM • Zod Validation

• Relational DB:  PostgreSQL 16 (Users, Projects, Request Traces, Immutable Audit Ledgers)

• Cache & Bus:    Redis 7 (Session Store, Real-time SSE Token Queues)

&nbsp;

\[ UNIFIED AI & GROUNDING ENGINE (Python 3.11 / Port 8000\) \]

• Framework:      FastAPI • Uvicorn • Pydantic v2 • Async HTTPX

• C++ Ingestion:  PyMuPDF4LLM (C++ native engine, 0 MB GPU VRAM, \<15ms/page) \+ pdfplumber Stream Mode

• Data Hygiene:   Table footnote unit inheritance (barg, ₹ Cr) \+ Lineage breadcrumbs

• Knowledge Store (Tri-Hybrid):

&nbsp;&nbsp;1\. Dense Vectors:   Embedded LanceDB (Apache Arrow zero-copy NVMe) via BAAI/bge-small-en-v1.5

&nbsp;&nbsp;2\. Sparse Keywords: Tantivy BM25 with synthetic equipment tag protection (P\_101A\_M)

&nbsp;&nbsp;3\. Plant Topology:  PlantTopologyEngine (NetworkX GraphML directed graph; Neo4j migration path)

• Query Routing:  CPU Non-LLM Classifier (Regex pre-filter \+ BGE embedding classifier, \<20ms)

• Context Rerank: FlashRank Cross-Encoder with Adaptive Reranker Bypass (BM25 \>= 0.95, \-400ms)

• Orchestrator:   LangGraph 11-node dual-spine StateGraph with custom state reducers

• NLP Parsing:    SpaCy (en\_core\_web\_sm) with decimal-hardened sentence delimiters

• Guardrail Core (Dual-Stage In-Flight):

&nbsp;&nbsp;1\. Symbolic:    Pint Physics Engine (Deterministic unit/dimensional consistency, \<1ms)

&nbsp;&nbsp;2\. Neural NLI:  DeBERTa-v3-base (ONNX Runtime INT8 on CPU, \<25ms) with discourse window (S\_{n-1}+S\_n)

&nbsp;&nbsp;3\. Buffer:      In-flight 1-Sentence Emission Delay Buffer (zero perceived latency)

• Generative LLM: Google Gemini 1.5 Flash (Cloud API) or local Meta-Llama-3.1-8B-Instruct (AWQ)

---

## 2\. Component Inventory & Hardware Allocation

| Component | Technology | Target Hardware | Resource Allocation | Dedicated GPU VRAM |
| :---- | :---- | :---- | :---- | :---- |
| **Document Ingestion** | `PyMuPDF4LLM` (C++) | Host CPU | $\<250,\\text{MB}$ RAM, Burstable | **$0,\\text{MB}$** |
| **Dense Vector Store** | `LanceDB` \+ `bge-small-en-v1.5` | NVMe SSD (mmap) | $\<350,\\text{MB}$ RAM, Zero-copy | **$0,\\text{MB}$** |
| **Topological Engine** | `PlantTopologyEngine` (`NetworkX`) | Host RAM | $\<25,\\text{MB}$ RAM | **$0,\\text{MB}$** |
| **Query Router** | CPU Classifier (`Regex` \+ `BGE`) | Host CPU | $\<150,\\text{MB}$ RAM (\<20ms burst) | **$0,\\text{MB}$** |
| **Context Reranker** | `FlashRank` (MiniLM) | Host CPU | $\<200,\\text{MB}$ RAM (\<25ms burst) | **$0,\\text{MB}$** |
| **Symbolic Physics** | `Pint` Engine | Host CPU (Python) | $\<20,\\text{MB}$ RAM (\<1ms) | **$0,\\text{MB}$** |
| **Neural Guardrail** | `DeBERTa-v3-base` (ONNX INT8) | Host CPU (2–4 threads) | $\<450,\\text{MB}$ RAM (\<25ms forward pass) | **$0,\\text{MB}$** |
| **Gateway & Database** | Fastify \+ Postgres \+ Redis | Host Server | 1–2 CPU Cores, $\\approx 600,\\text{MB}$ RAM | **$0,\\text{MB}$** |
| **Generative LLM** | `Gemini 1.5 Flash` / `Llama-3.1-8B` | Cloud API or 1x GPU | External API or $5.5,\\text{GB}$ VRAM | $0,\\text{MB}$ (Cloud) or 5.5 GB (Local) |
| **Total Base Host** | Single Enterprise Server | **4–8 CPU Cores** | **$\\approx 2,\\text{GB}$ Base RAM** | **$0,\\text{MB}$ GPU VRAM** *(with cloud LLM)* |

---

## 3\. End-to-End Operational Workflow

### Phase 1: Secure Ingestion & Indexing (Write Path)

1. **Authentication & Authorization:** User uploads PDF / CAD Line List via Next.js. Fastify API Gateway (M3) verifies user session and enforces `projectId` scoping.  
2. **Local C++ Extraction:** `PyMuPDF4LLM` parses text and tables on CPU in $\<15\\text{ms}$ per page with $0,\\text{MB}$ GPU VRAM.  
3. **Data Hygiene & Context Enrichment:**  
   * Global table footnote units (e.g., `barg`, `₹ Cr`) are injected directly into individual data cells.  
   * Lineage breadcrumbs (`[Doc > Section > Scope | Rev: ACTIVE]`) are stamped into chunk headers.  
   * Alphanumeric tags are pre-tokenized into a synthetic column (`P_101A_M`).  
   * CAD Line Lists are parsed into directed `NetworkX GraphML` with infinite traversal weights ($\\infty$) on Car-Sealed Closed (CSC) and Lockout/Tagout (LOTO) valves.  
4. **Scoped Persistence & File Cleanup:** Chunks, dense vectors, and sparse indices are written to embedded **LanceDB** via Apache Arrow, strictly tagged with `project_id`. Raw temporary files are securely unlinked immediately (Zero Parsing Leakage).

---

### Phase 2: Query Routing & Adaptive Retrieval (Read Path)

1. **Low-Latency Routing:** User submits a query; a CPU-based classifier (Regex \+ BGE embeddings) routes the request in $\<20\\text{ms}$ without an expensive LLM turn.  
2. **Confidence Check (0 Recursions):** If $\\text{Max Retrieval Score} \< 0.35$, the router halts execution immediately in $\<30\\text{ms}$ and emits:  
   *`"The uploaded documentation does not contain sufficient data regarding this query."`* (0 tokens consumed).  
3. **Tri-Hybrid Scoped Search (`WHERE project_id = $id`):**  
   * **Topology Track (`NetworkX`):** Traverses physical piping lines and upstream/downstream valve connections.  
   * **Exact Tag Track (`Tantivy BM25`):** Matches literal equipment codes (Adaptive Reranker Bypass skips reranker if $\\text{Score} \\ge 0.95$, saving $\\approx 400\\text{ms}$).  
   * **Semantic Track (`LanceDB`):** Retrieves contextual prose chunks via vector similarity.  
4. **Context Pruning:** `FlashRank` prunes candidate chunks down to Top-3 high-precision snippets in $\<25\\text{ms}$.

---

### Phase 3: Prompt-Injection Containment & Constrained Generation

1. **Data Containment:** Retrieved chunks are injected inside `<untrusted_evidence>` XML delimiters. System instructions enforce that document text is passive reference data, never executable instructions.  
2. **Greedy Generation:** The LLM (Gemini 1.5 Flash / local Llama-3.1-8B) streams tokens under greedy decoding ($\\text{Temperature} \= 0.0$) with strict epistemic refusal instructions (*"If not explicitly in context, state: 'Not specified in records'"*).

---

### Phase 4: In-Flight Dual-Stage Guardrail & Surgical Recovery

1. **1-Sentence Emission Delay Buffer:** Holds sentence $S\_n$ in memory while the LLM generates sentence $S\_{n+1}$ in parallel.  
2. **Dual-Stage Verification ($\<25\\text{ms}$ on CPU):**  
   * **Stage 1 (Symbolic):** `Pint` verifies dimensions and physical units deterministically in $\<1\\text{ms}$.  
   * **Stage 2 (Neural):** An INT8-quantized `DeBERTa-v3` Cross-Encoder scores factual entailment using sliding discourse context ($S\_{n-1} \+ S\_n$).  
3. **Branching Decision:**  
   * **PASS ($\\text{Score} \\ge 0.85$):** Flush $S\_n$ immediately to the client stream via SSE with a green confidence badge `[✓ 0.98 | Page 4]`.  
   * **FAIL ($\\text{Contradiction} \> 0.15$):** Intercept $S\_n$ in-flight (the false claim is never rendered). LangGraph prompts the LLM to rewrite **only that single sentence** using the conflicting evidence.  
   * **Circuit Breaker:** If the repaired sentence fails re-verification, the system halts retries (Max 1 retry cap) and emits an honest fallback disclaimer:  
     *`"[Note: Operating parameter could not be verified in active documentation.]"`*

---

### Phase 5: Streaming Delivery & Zero-Leak Audit Logging

1. **Client Rendering:** The Next.js UI renders verified claims with interactive source citations and page numbers in real time.  
2. **Zero-Leak Logging:** Fastify Gateway logs request IDs, execution latencies, verification scores, and decision source (`'llm_grounded'`, `'pre_filter'`, `'circuit_breaker'`) to PostgreSQL—never raw document text, chunks, or authentication tokens.

---

## 4\. The 7 Comprehensive Execution Cases

| Case | Scenario | Primary Trigger / Guard | Action Taken | Final User Experience |
| :---- | :---- | :---- | :---- | :---- |
| **Case 1** | Accurate, grounded statement | Pint \+ DeBERTa pass ($\\ge 0.85$) | Flushed immediately to SSE stream | Fluid real-time streaming `[✓ 0.98]` |
| **Case 2** | Numerical / pressure scaling error | `Pint` Symbolic Gate (\<1ms) | Intercepted; LangGraph rewrites sentence | Corrected number shown `[✓ Recovered]` |
| **Case 3** | Negation flip / attribute swap | `DeBERTa-v3` ONNX (\<25ms) | Intercepted; LangGraph rewrites sentence | Corrected clause shown `[✓ Recovered]` |
| **Case 4** | Extrinsic hallucination (absent data) | Circuit Breaker (1-retry limit) | Suppresses claim; halts retries | Transparent honest fallback disclosure |
| **Case 5** | Cross-tenant access attempt | Server-side `project_id` pre-filter | Query returns 0 records | Zero data leakage across projects |
| **Case 6** | Malicious injection inside PDF | `<untrusted_evidence>` wrapper | Treated as passive semantic text | Injection ignored; safety rules upheld |
| **Case 7** | Exact equipment tag lookup | Adaptive Reranker Bypass | Skips cross-encoder reranker | Response latency cut by \~400ms |

---

## 5\. Engineering Defense: Why This Architecture Outperforms Alternatives

1. **Zero-Leakage Security \+ High-Accuracy Integrity:**  
   Resolves the fundamental distinction between security (keeping private data inside) and accuracy (keeping hallucinations out). Strict `projectId` server-side filtering guarantees multi-tenant isolation, while the dual-stage guardrail guarantees factual truthfulness.  
2. **Elimination of the Microservices Tax:**  
   Consolidates Python AI and ML inference into a single in-process runtime using ONNX Runtime INT8 on host CPU, eliminating network hops, serialization latency, and multi-container memory bloat.  
3. **Sub-500ms Streaming (No Post-Hoc Lag):**  
   The in-flight 1-sentence emission delay buffer masks verification latency behind generation time, giving users instant streaming feedback while maintaining complete sentence-level safety.  
4. **Deterministic Physical Rigor:**  
   Combines `PlantTopologyEngine` (NetworkX) for physical piping connectivity with `Pint` for mathematical unit validation, preventing topological confabulations and calculation errors that blind neural models miss.  
5. **Circuit-Breaker Reliability:**  
   Eliminates infinite retry loops and cascading fabrications through a strict 1-retry cap, gracefully defaulting to transparent disclosures when documentation is insufficient.