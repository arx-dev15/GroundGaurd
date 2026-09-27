# GroundGuard — System Architecture

## 1. Architecture Overview

GroundGuard is a four-module system.

```text
                    USER
                      │
                      ▼
              ┌───────────────┐
              │   M4 WEB      │
              │   Next.js     │
              └───────┬───────┘
                      │
                  REST + SSE
                      │
                      ▼
              ┌───────────────┐
              │   M3 API      │
              │ Node + TS     │
              └───────┬───────┘
                      │
             ┌────────┼─────────┐
             │        │         │
             ▼        ▼         ▼
           M2 AI    M1 ML    PostgreSQL
             │        │
             │        │
             ▼        ▼
         Vector DB   Model
```

---

# 2. Services

| Service    | Owner | Technology                      |       Port |
| ---------- | ----- | ------------------------------- | ---------: |
| Web        | M4    | Next.js + TypeScript            |       3000 |
| API        | M3    | Node.js + TypeScript (Fastify)  |       4000 |
| AI         | M2    | Python + FastAPI                |       8000 |
| ML         | M1    | Python + FastAPI                |       8001 |
| PostgreSQL | M3    | PostgreSQL 16                   |       5432 |
| Redis      | M3    | Redis 7                         |       6379 |
| Qdrant     | M2    | Qdrant (Dense Vector Index)     |       6333 |
| Tantivy    | M2    | Tantivy (BM25 Lexical Index)    | File-based |
| NetworkX   | M2    | NetworkX (Entity Graph Index)   | File-based (`uploads/graphs/:projectId/topology.json`) |
| LanceDB    | M2    | LanceDB (Offline Research Only) | File-based |

The overall source architecture uses Next.js → Node → Python services, with PostgreSQL/Redis supporting the backend and Qdrant/Tantivy/NetworkX supporting knowledge retrieval. LanceDB is isolated for offline research/evaluation.

---

# 3. Ownership

## M1 — Grounding ML

Owns:

* NLI dataset
* Grounding model
* Model training
* Model evaluation
* Inference API
* Model versioning
* Grounding thresholds

Does not own:

* Retrieval
* LLM
* Node API
* Database
* Frontend

---

## M2 — AI/RAG

Owns:

* Document parsing
* Chunking
* Embeddings
* Vector search
* Retrieval
* Reranking
* Context construction
* LLM generation
* Claim processing
* Recovery agent

Does not own:

* Public Node API
* Application database
* Frontend
* Grounding model

---

## M3 — Backend/Platform

Owns:

* Public API
* Authentication
* Authorization
* Database
* Request orchestration
* Persistence
* SSE
* Cancellation
* API keys
* Metrics
* Evaluation endpoints

---

## M4 — Frontend/DevOps

Owns:

* Next.js UI
* Chat UI
* Evidence UI
* Claim UI
* Evaluation UI
* Docker integration
* CI/CD
* Monitoring
* Deployment
* E2E frontend experience

---

# 4. Communication Rules

Frontend:

```text
M4 → M3 ONLY
```

Backend:

```text
M3 → M2
M3 → M1
M3 → PostgreSQL
M3 → Redis
```

AI:

```text
M2 → Qdrant (Dense Vector)
M2 → Tantivy (Lexical BM25)
M2 → NetworkX (Entity Graph)
M2 → LLM
M2 → M1
```

The browser must never directly access:

```text
M1
M2
PostgreSQL
Qdrant / Knowledge Indexes
Redis
```

---

# 5. Main Generation Architecture

```text
M4
 ↓
M3
 ↓
M2 Retrieval
 ↓
M2 LLM
 ↓
Claim Processor
 ↓
M1 Verification
 ↓
 ┌──────────────┐
 │              │
PASS           FAIL
 │              │
 │              ▼
 │          M2 Recovery
 │              │
 │              ▼
 │          M1 Verify
 │              │
 └───────┬──────┘
         ▼
       M3
         ↓
       M4
```

---

# 6. Document Architecture

```text
Public M3 PDF Upload
        ↓
Authentication + Project Ownership (M3)
        ↓
M2 Ingestion (/ingest)
        ↓
Parser (Magic byte check + PDF text)
        ↓
Cleaner & Lineage Chunker (Section/Heading/Identifiers)
        ↓
Embedding (sentence-transformers/all-MiniLM-L6-v2)
        ↓
Derived Knowledge Indexing:
  ├── Qdrant (Dense Vectors + Metadata)
  ├── Tantivy (BM25 Lexical Index)
  └── NetworkX (Topological Graph)
        ↓
M2 returns Chunks + Lineage to M3
        ↓
M3 Persists Chunks to PostgreSQL (Canonical Truth)
        ↓
M3 marks Document READY
```

---

# 7. Project Isolation

Every retrieval request must include:

```text
projectId
```

Retrieval must never return chunks belonging to another project.

---

# 8. Request Tracing

Every request gets:

```text
requestId
```

Every generation gets:

```text
generationId
```

Every claim gets:

```text
claimId
```

Every ML result gets:

```text
modelVersion
```

This allows:

```text
Frontend
 ↓
requestId
 ↓
Node logs
 ↓
AI logs
 ↓
ML logs
```

---

# 9. Data Ownership

M3 owns the canonical application database (PostgreSQL):
* Users, Projects, Documents metadata, Document Chunks (canonical truth), Conversations, Messages, Generations, Claims, Evidence, API Keys.
* M3 exclusively persists canonical chunk text and lineage metadata into PostgreSQL.

M2 owns the derived retrieval and knowledge indexing layer:
* Qdrant: Production dense vector index (UUIDv5 IDs, project/document/identifier payload filtering).
* Tantivy: Production BM25 lexical search index on disk.
* NetworkX: Production entity-relationship topology graph on disk.
* LanceDB: Offline research and evaluation sandbox only (not on the online request path).

M1 owns model artifacts and ML evaluation artifacts.

M4 owns deployment configuration and UI.

Storage Rebuildability & Migration Policy:
* `pgvector` was fully retired from production in Migration 004 (`ALTER TABLE chunks DROP COLUMN IF EXISTS embedding`). It is retained solely in historical migration 002 for audit trails.
* Qdrant and Tantivy can be deterministically rebuilt from PostgreSQL canonical chunk records via `migrate_to_qdrant_and_tantivy.py`.
* NetworkX graph can be reconstructed by re-extracting technical entity relationships from document text.

---

# 10. Failure Isolation

If M1 fails:

```text
generation.status = verification_failed
```

If M2 fails:

```text
generation.status = generation_failed
```

If document ingestion fails:

```text
document.status = failed
```

No service should silently pretend another service succeeded.
