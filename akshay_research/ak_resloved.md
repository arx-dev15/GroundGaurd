# GroundingGuard: Sentence-Level Hallucination Guardrail via Contrastive Cross-Encoders

## 1\. Problem Statement

In Retrieval-Augmented Generation (RAG) and agentic AI architectures, Large Language Models (LLMs) frequently suffer from **grounding hallucinations**—generating statements that appear authoritative and syntactically fluent but directly contradict or are unsupported by retrieved reference documents.

### Key Manifestations:

* **Subtle Parametric Drift:** Small changes in critical tokens, such as flipping polarity (*"not approved"* vs. *"approved"*), swapping numbers (*"15%"* vs. *"45%"*, *"₹50 Cr"* vs. *"₹80 Cr"*), or misattributing properties between similar entities.  
* **Granularity Mismatch:** Document-level evaluation is too coarse (discarding an entire multi-paragraph response over one minor date error), while token-level checks lack semantic context.  
* **The Real-Time Guardrail Challenge:** Verifying assertions at the individual claim/sentence level in real time (\<30 ms per claim) without breaking token streaming or incurring prohibitive API costs.

---

## 2\. Existing Solutions & Literature

Research and industrial solutions generally fall into two categories:

### A. Academic Literature & Prompt-Based Verifiers

* **LLM-as-a-Judge & Self-Reflection:** Systems such as *Self-RAG* (Asai et al., ICLR 2024), *Corrective RAG (CRAG)* (Yan et al., 2024), and *Chain-of-Verification (CoVe)* (Dhuliawala et al., ACL 2024\) use prompt engineering to instruct an LLM to evaluate its own answers against context.  
* **Pretrained NLI Classifiers:** Frameworks like *FactCC* (Kryściński et al., EMNLP) and *MiniCheck* (Lyu et al., EMNLP 2024\) employ RoBERTa or DeBERTa models fine-tuned on general NLI benchmarks (MNLI/SNLI) to classify sentence entailment.

### B. Industrial Tools & Frameworks

* **Gateway Firewalls:** *NVIDIA NeMo Guardrails* (programmable Colang rails with LLM self-checks), *Guardrails AI* (Pydantic schema validators), and *Aporia AI Guardrails* (multi-SLM proxy).  
* **Observability & Consistency Evaluators:** *Vectara HHEM* (Hughes Hallucination Evaluation Model), *Galileo ChainPoll*, *TruLens (RAG Triad)*, and *Ragas*.

---

## 3\. Where Existing Solutions Fail

| Failure Mode | Current Industry & Academic Implementations | Impact on Production Systems |
| :---- | :---- | :---- |
| **1\. Latency & API Cost Explosion** | LLM-as-a-judge (NeMo, Self-RAG, CoVe, Galileo ChainPoll) prompts a secondary LLM for factuality checks. | Adds 1.5s–4.0s of latency per claim and triples recurring token costs. LLMs also suffer from self-preference bias, approving their own fabrications. |
| **2\. Streaming Paralysis (Post-Hoc Lag)** | Frameworks like TruLens, Ragas, Vectara HHEM, and Guardrails AI validate outputs **only after** full text generation finishes. | Users wait 6–10 seconds staring at a blank screen or spinner. Real-time token streaming is completely broken. |
| **3\. Dimensional & Physical Unit Blindness** | Pure neural NLI models (BERT, RoBERTa, DeBERTa) and LLMs evaluate semantic embeddings rather than physical/mathematical equivalence. | Fails to detect numerical scaling or unit conversions (e.g., treating 10 bar \= 100 kPa as semantically valid, missing the 10x calculation error). |
| **4\. Combinatorial $N \\times K$ Complexity** | Evaluating every generated sentence ($N$) against every retrieved chunk ($K$) causes $N \\times K$ cross-encoder evaluations. | Running 25–30 full transformer forward passes chokes CPU/GPU queues, creating backpressure. |
| **5\. Destructive All-or-Nothing Rejection** | When validation fails, tools like Guardrails AI or NeMo trigger unhandled exceptions or canned refusals (*"I cannot answer that"*). | Discards the 90% of the response that was accurate and grounded, frustrating the user. |

---

## 4\. Our Updated & Optimized Architecture (GroundingGuard)

### High-Performance Tech Stack Overview:

* **Frontend:** Next.js 14/15 App Router, TypeScript, Tailwind CSS, shadcn/ui (Optimized for Server-Sent Events / SSE).  
* **API Gateway:** Node.js (v20+), Fastify, TypeScript, Prisma, PostgreSQL 16 (Relational & Auth), Redis 7 (Streaming queues).  
* **Document Ingestion:** PyMuPDF4LLM (C++ native engine, 0 MB GPU VRAM, \<15 ms per page) \+ pdfplumber Stream Mode fallback \+ Table footnote unit inheritance.  
* **Knowledge Store:** Embedded LanceDB (Apache Arrow zero-copy memory-mapped disk reads) \+ Tantivy BM25 \+ Synthetic equipment tag column (`P_101A_M`).  
* **Graph Orchestrator:** LangGraph 11-node dual-spine state machine (`RefineryAgentState`) with custom state reducers.  
* **Control Routing:** External Non-LLM CPU Router (Regex pre-filter \+ BGE embedding classifier, \<20 ms routing).  
* **Context Reranking:** FlashRank Cross-Encoder with Adaptive Reranker Bypass (skips reranker on exact tag match $\\ge 0.95$, saving \~400 ms).  
* **Dual-Stage In-Flight Guardrail:**  
  1. *Symbolic Physics Gate:* Pint unit/dimensional consistency solver.  
  2. *Neural Entailment Model:* Fine-tuned `DeBERTa-v3-base` running on CPU via ONNX Runtime INT8 dynamic quantization (\<25 ms latency).  
  3. *In-Flight 1-Sentence Emission Delay Buffer:* Holds sentence $N$ in a memory buffer; verifies it on CPU while sentence $N+1$ generates.

---

## 5\. Why Our Architecture Delivers the Best User Interface (UI/UX)

1. **Fluid, Zero-Perceived-Latency Streaming:**  
   * By buffering exactly **one sentence ahead**, verification latency (\<25 ms) is completely absorbed while the LLM generates the opening tokens of the subsequent sentence. The user experiences responsive, uninterrupted token streaming with a Time-to-First-Token (TTFT) under 500 ms.  
2. **Surgical In-Flight Claim Repair (No Canned Refusals):**  
   * If a sentence fails verification, it is intercepted before it ever touches the client screen. LangGraph executes a localized rewrite of that single sentence using the conflicting context. Accurate sentences remain untouched, avoiding destructive response drops.  
3. **Interactive Visual Trust & Attribution:**  
   * Every sentence is delivered alongside interactive audit metadata: green confidence badges (`[✓ 0.98 | Page 4]`), amber recovery badges (`[✓ Recovered | Page 4]`), and an inline evidence drawer allowing instant verification against source PDFs.  
4. **Lightweight Mobile Footprint:**  
   * All neural, vector, and symbolic computations execute entirely on the host server. The client device (mobile browser/PWA) only consumes lightweight Server-Sent Events (\~2 KB/s), preserving mobile battery and bandwidth.