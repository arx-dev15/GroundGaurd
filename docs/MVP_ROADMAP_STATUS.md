# GroundGuard MVP — Production Architecture, Phase Roadmap & Current Status

> **Notice:** This file is the canonical high-level roadmap, architecture boundary, and implementation-status reference for the GroundGuard repository. The actual source code and runtime configurations remain the ultimate technical source of truth.

---

## 1. Product Definition & Core Mission

**GroundGuard** is an enterprise-grade AI system designed for **document-grounded technical question answering** with:
* **Deterministic Evidence Provenance**: Exact attribution back to source documents, page numbers, chunks, and technical identifiers.
* **Claim-Level Grounding Verification**: Dual-stage Natural Language Inference (NLI) to verify whether generated answers are entailed, contradictory, or unsupported.
* **Failure-Aware Agentic Recovery**: Targeted repair and evidence retrieval for invalid claims without full-answer hallucination loops.
* **Multi-Store Knowledge Indexing**: Integrated semantic dense vectors, BM25 lexical search, and evidence-grounded topological relationship graphs.

### End-to-End Product Flow

```text
User uploads technical documents (PDFs)
        ↓
M3 Gatekeeper parses, validates & routes to M2
        ↓
M2 chunks, normalizes identifiers, embeds & indexes across multi-store backend
        ↓
User asks a technical query
        ↓
Phase 4 Hybrid Engine retrieves project-isolated dense, lexical & graph candidates
        ↓
Phase 5 RAG Agent generates structured answer with linked claims
        ↓
Phase 6 Claim Extractor isolates atomic factual propositions with source chunk IDs
        ↓
Phase 7 M1 Verifier executes dual-stage NLI grounding verification
        ↓
Phase 8 Recovery Agent repairs or flags unsupported/contradictory claims
        ↓
Phase 9 SSE streams verified answer + evidence provenance + verification badges to UI
        ↓
Phase 10 Frontend displays grounded answer with interactive citation audit trail
```

---

## 2. Production Service Boundaries

GroundGuard enforces strict modular separation across four decoupled services:

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        M4 — Frontend Product UX                        │
│                   React / Next.js / TailwindCSS (Web)                  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ (HTTP / SSE / REST)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     M3 — Fastify TypeScript Gateway                    │
│  - Public API & Routing          - Document Lifecycle Machine          │
│  - Authentication (bcryptjs/JWT) - PostgreSQL Application Truth        │
│  - Project Ownership Isolation   - Shared Contracts & Types            │
└───────────────────┬────────────────────────────────┬───────────────────┘
                    │ (Internal HTTP)                │ (Internal HTTP)
                    ▼                                ▼
┌──────────────────────────────────────┐ ┌───────────────────────────────┐
│       M2 — Python AI/RAG Service     │ │  M1 — Python Grounding Engine │
│  - PDF Parsing (pypdf)               │ │  - Small NLI Cross-Encoder    │
│  - Identifier Normalization          │ │  - Token-Level Entailment     │
│  - Dense Embeddings (MiniLM-L6-v2)   │ │  - Contradiction / Neutral    │
│  - Qdrant Vector Index Management    │ │  - Claim Grounding Scores     │
│  - Tantivy BM25 Lexical Management   │ │  - Batch Verification API     │
│  - NetworkX Topology Graphs          │ └───────────────────────────────┘
│  - Hybrid Retrieval & Router (Ph 4)  │
│  - RAG Generation & Recovery (Ph 5,8)│
└──────────────────────────────────────┘
```

### Architectural Invariants
1. **Browser Access Invariant:** Browser / client applications communicate **exclusively with M3**. M2 and M1 are internal, private microservices.
2. **Service Separation:** M3 (Gateway/Persistence) and M2 (AI/RAG) remain distinct services with separate runtimes and responsibilities; they must never be merged.
3. **Single Canonical Ownership:** One capability = one owner. M3 owns public lifecycle and SQL truth; M2 owns derived knowledge indexing and retrieval.

---

## 3. Canonical Storage Ownership

| System | Role | Scope & Lifecycle | Rebuildability / Source |
| :--- | :--- | :--- | :--- |
| **PostgreSQL 16** | **CANONICAL TRUTH** | Application truth: `users`, `projects`, `documents` (lifecycle states), `chunks` (text, page numbers, section/heading lineage, identifiers JSONB). | Canonical source of truth. Persistent and connection-pooled. |
| **Qdrant** | **PRODUCTION DENSE VECTOR STORE** | Production semantic ANN retrieval (384-dim Cosine, UUIDv5 deterministic point IDs, payload keyword filters on `projectId`, `documentId`, `identifierKeys`). | **Derived & Rebuildable** from PostgreSQL chunk text via `migrate_to_qdrant_and_tantivy.py`. |
| **Tantivy** | **PRODUCTION LEXICAL / BM25 STORE** | Production keyword & identifier matching (`uploads/indexes/tantivy`, disk-backed, project-scoped Boolean query parsing). | **Derived & Rebuildable** from PostgreSQL chunk text via `migrate_to_qdrant_and_tantivy.py`. |
| **NetworkX** | **PRODUCTION TOPOLOGY GRAPH** | Project-scoped directional relationships (`uploads/graphs/:projectId/topology.json`, chunk provenance, zero-edge success invariant). | **Derived & Rebuildable** by re-extracting relations from document chunks. |
| **Redis 7** | **RUNTIME STATE / CACHE** | Baseline for distributed locks, session caching, and rate limiting where configured. | Volatile / Ephemeral cache. |
| **LanceDB** | **OFFLINE RESEARCH / EVALUATION ONLY** | **NO online production request path.** Zero runtime dependency in M2/M3. Dedicated to offline benchmark evaluations, dataset comparisons, and ablation experiments in Phase 11. | Offline / Research sandbox only. |
| **pgvector** | **HISTORICAL MIGRATION FOOTPRINT ONLY** | **Fully retired from active production retrieval** in migration 004. Retained solely in historical migration 002 for database version audit trails. | Retired. |

---

## 4. MVP Phase Roadmap & Current Status

The GroundGuard Core MVP comprises exactly **12 structured phases**:

```text
Phase 1  — Foundation & Contracts                  [ COMPLETE ]
Phase 2  — Authentication + Projects               [ COMPLETE ]
Phase 3  — Secure Document Ingestion + Indexing    [ COMPLETE ]
Phase 4  — Hybrid Retrieval + Knowledge Layer      [ PARTIAL - IN PROGRESS ]
Phase 5  — Conversations + RAG Generation          [ NOT IMPLEMENTED ]
Phase 6  — Claim Extraction + Evidence Provenance   [ NOT IMPLEMENTED ]
Phase 7  — Dual-Stage Grounding Verification       [ STUB / PARTIAL ]
Phase 8  — Failure-Aware Agentic Recovery          [ NOT IMPLEMENTED ]
Phase 9  — Verified Streaming + Runtime State      [ NOT IMPLEMENTED ]
Phase 10 — Complete Frontend / Product UX          [ NOT IMPLEMENTED ]
Phase 11 — Evaluation + Calibration + Research     [ NOT IMPLEMENTED ]
Phase 12 — Production Security + Hardening         [ PARTIAL ]
```

---

### Phase 1 — Foundation & Contracts
* **Goal:** Core monorepo setup, shared type contracts, Fastify/FastAPI server skeletons, observability, and structured logging.
* **Core Capabilities:** Fastify 4.26 gateway (M3), Python FastAPI AI service (M2), Python FastAPI verification service (M1), `@groundguard/contracts`, `@groundguard/types`, Pino structured logging with `x-request-id` header propagation, AppError standard envelope, `/health` and `/health/readiness` endpoints.
* **Status:** `COMPLETE`
* **Validation:** 4/4 integration tests passing, TypeScript compilation clean.

### Phase 2 — Authentication + Projects
* **Goal:** User authentication, token issuance, project creation, and tenant-scoped data isolation.
* **Core Capabilities:** User registration/login via `bcryptjs` (salt rounds=10), JWT tokens with 24h expiry, `/v1/auth/me` user context resolution, Project CRUD (`/v1/projects`), Simple Project Ownership authorization (`WHERE user_id = $1`), migrations 001 & 002.
* **Status:** `COMPLETE`
* **Validation:** 22/22 integration tests passing (cross-user isolation, token validation, CRUD operations).

### Phase 3 — Secure Document Ingestion + Knowledge Indexing
* **Goal:** Public document upload, validation, parsing, lineage-preserving chunking, identifier extraction, multi-store derived indexing, compensating cleanup, and fail-closed deletion.
* **Core Capabilities:** Magic bytes `%PDF` validation, `pypdf` baseline parser, technical identifier normalization (`V-204`, `P-101A`, `API 610`), `sentence-transformers/all-MiniLM-L6-v2` 384-dim embeddings, Qdrant dense vector store, Tantivy BM25 lexical store, NetworkX directed topology graph (`upstream_of`, `downstream_of`, `connected_to`), zero-edge success invariant, compensating cleanup on indexing failure, fail-closed deletion, migration 003 (lineage metadata), migration 004 (pgvector retirement).
* **Status:** `COMPLETE` (Frozen)
* **Validation:** 19/19 Phase 3 tests passing, 3/3 compensating cleanup tests passing, pgvector fully retired.

### Phase 4 — Hybrid Retrieval + Knowledge Layer
* **Goal:** Multi-source retrieval engine combining dense vector similarity, BM25 lexical matching, and graph traversal with query routing, Reciprocal Rank Fusion (RRF), and FlashRank reranking.
* **Core Capabilities:**
  * *Implemented:* Dense Qdrant search with mandatory project filtering; Tantivy BM25 lexical search with Boolean project scoping; PostgreSQL candidate `ready` lifecycle validation.
  * *Partial:* NetworkX graph relation querying (implemented in `graph_store.py`, exposed via `/sanity/search`, pending `/retrieve` pipeline integration).
  * *Remaining:* Query router (dense vs. lexical vs. graph vs. hybrid), Reciprocal Rank Fusion (RRF), FlashRank cross-encoder reranking, Evidence Sufficiency checking (`isSufficient`), top-K evidence selection.
* **Status:** `PARTIAL (ACTIVE PHASE)`

### Phase 5 — Conversations + RAG Generation
* **Goal:** Stateful conversation management, message history, retrieval-augmented prompt orchestration, and LLM answer generation.
* **Core Capabilities:** Conversation & message persistence in PostgreSQL, project-scoped conversation history, context budget assembling, LLM invocation (Groq / OpenAI / local model), structured generation response containing preliminary answers and linked retrieval context.
* **Status:** `NOT IMPLEMENTED` (Placeholder contract exists).

### Phase 6 — Claim Extraction + Evidence Provenance
* **Goal:** Decomposition of generated technical answers into atomic factual claims with explicit evidence attribution.
* **Core Capabilities:** Heuristic and LLM-based claim segmenter, claim-to-chunk alignment mapping, structured `ClaimItem` model (`claimId`, `text`, `status`, `evidenceChunkIds`, `provenance`), sentence-level citation binding.
* **Status:** `NOT IMPLEMENTED` (Placeholder schemas exist in `@groundguard/contracts`).

### Phase 7 — Dual-Stage Grounding Verification
* **Goal:** Independent verification of each generated claim against cited evidence chunks using Natural Language Inference (NLI).
* **Core Capabilities:** M1 Verification Service, cross-encoder NLI classification (`entailment`, `contradiction`, `neutral`), token-level overlap scoring, batch verification endpoint (`POST /verify`), grounding score calculation, model calibration metadata.
* **Status:** `STUB / PARTIAL` (M1 service skeleton exists; production NLI pipeline pending).

### Phase 8 — Failure-Aware Agentic Recovery
* **Goal:** Autonomous diagnosis and selective repair of contradictory or unsupported claims without discarding valid parts of the answer.
* **Core Capabilities:** Failure classification (Missing Evidence, Contradiction, Entity Misattribution), targeted secondary retrieval, localized claim rewrite, iterative re-verification loop, claim status finalization (`verified`, `flagged`, `recovered`, `needs_review`).
* **Status:** `NOT IMPLEMENTED` (Placeholder schemas exist).

### Phase 9 — Verified Streaming + Runtime State
* **Goal:** Server-Sent Events (SSE) streaming delivering verified answers, progressive verification badges, and token deltas in real-time.
* **Core Capabilities:** M3 Fastify SSE endpoint (`GET /v1/projects/:projectId/conversations/:id/stream`), lifecycle event schemas (`generation.started`, `token.delta`, `claim.verifying`, `claim.verified`, `claim.flagged`, `recovery.started`, `generation.completed`), client cancellation handling.
* **Status:** `NOT IMPLEMENTED`.

### Phase 10 — Complete Frontend / Product UX
* **Goal:** Interactive product web application enabling engineers to upload documentation, query technical systems, inspect evidence citations, and visualize grounding badges.
* **Core Capabilities:** Next.js / React application (M4), JWT authentication & registration UI, project management dashboard, drag-and-drop PDF upload with progress tracking, chat interface with streaming answers, citation drawer displaying exact PDF chunk text & page numbers, interactive graph visualization, grounding score display.
* **Status:** `NOT IMPLEMENTED`.

### Phase 11 — Evaluation + Calibration + Research Layer
* **Goal:** Formal benchmarking, retrieval evaluation (MRR/NDCG), grounding accuracy metrics, LanceDB offline comparison sandbox, and ablation studies.
* **Core Capabilities:** Retrieval benchmark suite against industrial technical QA datasets, Hallucination/Contradiction detection evaluation, recovery success rate tracking, latency/cost profiling, LanceDB offline research experiments comparing alternative vector models and index structures.
* **Status:** `NOT IMPLEMENTED`.

### Phase 12 — Production Security + Hardening + Deployment
* **Goal:** Enterprise security, containerization, deployment manifests, rate limiting, and operational resilience.
* **Core Capabilities:** Production environment secrets enforcement, Docker Compose production manifests, rate limiting, CORS configuration, database connection pooling, automated backup strategies, health & readiness monitoring, structured error alerting.
* **Status:** `PARTIAL` (Base Docker configurations and production fail-fast validations exist; final deployment hardening pending).

---

## 5. Current Overall Progress Matrix

| Phase | Phase Name | Status | Verified Technical State |
| :---: | :--- | :---: | :--- |
| **1** | Foundation & Contracts | **COMPLETE** | Fastify, Pino logging, request ID propagation, standard error envelope, contracts. |
| **2** | Authentication + Projects | **COMPLETE** | `bcryptjs`, JWT, user context resolution, simple project ownership CRUD. |
| **3** | Secure Ingestion + Indexing | **COMPLETE** | `%PDF` check, `pypdf`, normalization, MiniLM, Qdrant, Tantivy, NetworkX, 004 migration. |
| **4** | Hybrid Retrieval + Knowledge | **PARTIAL** | Dense & BM25 retrieval integrated; Router, RRF Fusion & FlashRank pending. |
| **5** | Conversations + Generation | **NOT IMPLEMENTED** | Schemas exist; generation loop pending. |
| **6** | Claim Extraction & Provenance | **NOT IMPLEMENTED** | Schemas exist; atomic claim decomposition pending. |
| **7** | Grounding Verification | **STUB / PARTIAL** | M1 skeleton exists; production NLI cross-encoder pending. |
| **8** | Agentic Recovery | **NOT IMPLEMENTED** | Recovery contracts exist; targeted repair loop pending. |
| **9** | Verified Streaming | **NOT IMPLEMENTED** | SSE protocol defined; streaming engine pending. |
| **10** | Frontend / Product UX | **NOT IMPLEMENTED** | M4 UI implementation pending. |
| **11** | Evaluation & Research | **NOT IMPLEMENTED** | Benchmarking harness & LanceDB offline sandbox pending. |
| **12** | Production Hardening | **PARTIAL** | Docker Compose and fail-fast startup checks active; deployment hardening pending. |

---

## 6. Definitions of Completion

### What "MVP Complete" Means
GroundGuard MVP is **not complete** merely because ingestion and test suites succeed. The Core MVP is achieved only when **all 12 phases reach intended closure** and support the unified end-to-end user journey:
```text
Register/Login → Create Project → Upload Technical PDFs → Multi-Store Indexing →
Ask Question → Fused Multi-Source Retrieval → Generate Answer → Decompose Claims →
NLI Verification → Targeted Claim Recovery → Verified Stream to Frontend UI →
Audit Evidence Provenance & Graph Relations
```

### What "Production-Ready" Means
Code implementation is distinct from production readiness. Production readiness strictly requires:
* Real PostgreSQL 16 database with pooled connections and zero in-memory fallbacks.
* Real persistent external Qdrant daemon with active keyword payload indexes.
* Disk-backed Tantivy indexes and disk-backed NetworkX JSON topologies.
* Production secrets enforcement (rejecting default dev secrets).
* Full fail-closed error handling and cascading compensating cleanups.
* Complete test suite coverage across unit, integration, and failure-injection paths.

---

## 7. Current Active Phase & Immediate Roadmap

```text
Current Active Phase: Phase 4 — Hybrid Retrieval + Knowledge Layer
Phases 1–3 Status:    FROZEN (Protected against modification except for critical regression fixes)
```

### Phase 4 Execution Sequence:
1. **Graph Retrieval Integration:** Wire `graph_store.query_relations` into the `/retrieve` candidate generation pipeline.
2. **Query Router:** Implement query classifier to detect whether queries require dense semantic search, lexical tag matching, topological graph traversal, or hybrid execution.
3. **Reciprocal Rank Fusion (RRF):** Implement standard RRF algorithm ($RRF(d) = \sum \frac{1}{k + r_i(d)}$) to fuse dense and BM25 candidate ranks.
4. **FlashRank Reranking:** Integrate lightweight cross-encoder reranker to score and order top candidate chunks.
5. **Evidence Sufficiency:** Implement `isSufficient` confidence determination before passing context to generation.
6. **Retrieval Validation:** Test and benchmark multi-tenant project isolation and retrieval quality.

---

## 8. Post-MVP & Research Extensions

The following items are **strictly post-MVP research directions** and must not be mixed into the 12-phase MVP:
* **Adaptive Multi-Hop Routing:** Dynamic multi-turn iterative graph-and-vector retrieval.
* **Specialized Modality Verifiers:** Dedicated table-parsing verifiers, engineering P&ID drawing vision verifiers, and temporal constraint verifiers.
* **Enterprise Graph Scale (Neo4j):** Migration from NetworkX JSON topologies to dedicated Graph Databases if project entity counts exceed millions.
* **Model Quantization & ONNX Runtime:** Inference latency optimization for edge and on-premise deployments.

---

## 9. Engineering Guardrails (Non-Negotiables)

1. **One Capability $\rightarrow$ One Canonical Owner:**
   * M3 owns PostgreSQL application persistence, lifecycle transitions, and public APIs.
   * M2 owns ingestion parsing, embedding generation, Qdrant, Tantivy, and NetworkX.
   * M1 owns grounding verification and NLI inference.
2. **PostgreSQL is Canonical:** Qdrant, Tantivy, and NetworkX are derived, rebuildable stores.
3. **Qdrant is the Single Production Dense Vector Store:** No secondary active vector engines in production.
4. **Strict Multi-Tenant Isolation:** Project boundaries are enforced *inside candidate generation queries* (Qdrant payload filters, Tantivy Boolean queries, project-scoped graph files).
5. **No Silent Production Fallbacks:** If a required external daemon (PostgreSQL, Qdrant, Tantivy) is unreachable in `production` mode, the service must fail startup immediately with an explicit error.
6. **Shared Contract Precedence:** TypeScript types in `@groundguard/contracts` and `@groundguard/types` dictate API interfaces; Python models must strictly align.
7. **No Premature Phase Leakage:** Phase $N$ must be validated and closed before Phase $N+1$ architecture is implemented.

---

## 10. Updating This Document

This document must be updated **only** when:
* A phase status changes (e.g. Phase 4 progresses from `PARTIAL` to `COMPLETE`).
* An architectural boundary or storage ownership changes through an approved design decision.
* A major production validation milestone is achieved.

*Minor code refactors and routine test runs do not warrant roadmap document updates. Source code remains the ultimate ground truth.*
