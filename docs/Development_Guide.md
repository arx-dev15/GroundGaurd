# GroundGuard — Development Guide

## 1. Prerequisites

Required:

```text
Git
Node.js
Python
Docker
Docker Compose
PostgreSQL
```

Recommended:

```text
VS Code
```

---

# 2. Repository

```text
grounding-guard/
├── apps/
├── services/
├── packages/
├── infra/
├── datasets/
├── docs/
├── docker-compose.yml
└── README.md
```

---

# 3. Local Services

```text
web       : 3000 (Next.js)
api       : 4000 (Fastify / Node.js)
ai        : 8000 (FastAPI / Python)
ml        : 8001 (FastAPI / Python)
postgres  : 5432 (PostgreSQL 16)
redis     : 6379 (Redis 7)
qdrant    : 6333 (Qdrant Vector DB)
```

---

# 4. Environment

Create:

```text
.env
```

from:

```text
.env.example
```

Never commit `.env`.

---

# 5. Start Infrastructure

```bash
docker compose up --build
```

---

# 6. Development Order

GroundGuard follows a structured 12-phase delivery lifecycle (see `docs/MVP_ROADMAP_STATUS.md` for real-time status):

### Phase 1 — Repository Foundation & Mock Contracts (COMPLETED)
* Monorepo setup, shared `@groundguard/contracts` & `@groundguard/types`, Fastify M3 skeleton, Mock AI/ML services, PostgreSQL migrations, and health checks.

### Phase 2 — First End-to-End Vertical Slice (COMPLETED)
* Complete synchronous pipeline: Document upload → Ingestion → Retrieval → Generation → Verification → Claim persistence → Frontend payload contract.

### Phase 3 — Secure Ingestion & Multi-Store Knowledge Indexing (COMPLETED)
* PDF validation, lineage chunking (`section`, `heading`, `identifiers`), `sentence-transformers` 384-dim embeddings, Qdrant dense vector store, Tantivy BM25 store, NetworkX entity topology graph, pgvector retirement (migration 004), M3 canonical chunk persistence.

### Phase 4 — Production Grounding ML Engine (NEXT)
* Real NLI cross-encoder model training/loading (`DeBERTa-v3`), 3-way classification (`entailment`, `contradiction`, `neutral`), calibrated grounding confidence thresholds, batch verification endpoints.

### Phase 5 — Production Agentic Recovery Loop
* Claim-level hallucination detection, LangGraph recovery agent, targeted re-retrieval, constraint-guided regeneration, reverification loop with bounded attempts.

### Phase 6 — Real-Time Verification Streaming (SSE)
* Server-Sent Events from M3 to M4 for progressive token streaming, real-time sentence-level verification badges, and recovery notifications.

### Phase 7 — Evidence-Grounded Frontend UI
* Next.js 14 web application: Document management, interactive chat workspace, inline claim verification badges, evidence inspector drawer, latency metrics.

### Phase 8 — Reliability, Evaluation & Benchmarking
* Automated grounding accuracy evaluations, hallucination benchmark datasets, precision/recall/F1 metrics dashboard, regression testing harness.

### Phase 9 — Security, Developer APIs & Key Management
* Public developer API keys (hash-based authentication), rate limiting, project-scoped data protection, input sanitization.

### Phase 10 — Production Docker & Deployment Infrastructure
* Multi-stage Dockerfiles, production docker-compose, CI/CD automated test workflows, environment configuration validation.

### Phase 11 — Evaluation + Calibration + Research + Developer Layer
* Formal retrieval and grounding accuracy benchmarks (MRR/NDCG), hallucination detection evaluations, developer API keys, and LanceDB offline research/comparison sandbox (isolated from online production path).

### Phase 12 — Production Security + Hardening + Deployment
* Enterprise security, production secrets enforcement, rate limiting, production containerization manifests, structured monitoring, and full system end-to-end release verification.

---

# 7. Branching

Use:

```text
main
```

for stable integration.

Each member uses feature branches.

Example:

```text
m1/grounding-model
m2/rag-pipeline
m3/generation-api
m4/chat-ui
```

---

# 8. Pull Requests

Every PR should contain:

```text
What changed?
Why?
Tests?
Contract changes?
Database changes?
Breaking changes?
```

---

# 9. Testing

Before merging:

```bash
npm test
```

and/or the appropriate Python test command.

Critical integration tests must pass.

---

# 10. E2E Smoke Test

The team must be able to execute:

```text
Register
 ↓
Create project
 ↓
Upload PDF
 ↓
Document READY
 ↓
Ask question
 ↓
Retrieve
 ↓
Generate
 ↓
Verify
 ↓
Persist
 ↓
Display
```

---

# 11. Recovery E2E

Test:

```text
Bad answer
 ↓
Contradiction
 ↓
Recovery
 ↓
New answer
 ↓
Reverification
 ↓
Verified
```

---

# 12. Logging

Every important operation should expose:

```text
requestId
generationId
service
operation
duration
status
```

Example:

```text
[AI] requestId=req_123 operation=retrieve duration=142ms
```

---

# 13. Health Checks

Each service should expose health information.

M1:

```http
GET /health
```

AI:

```http
GET /health
```

API:

```http
GET /health
```

Web should report availability through deployment infrastructure.

---

# 14. Documentation Rule

When implementation changes behavior:

```text
Code
+
Tests
+
Contract
+
Docs
```

must remain synchronized.
