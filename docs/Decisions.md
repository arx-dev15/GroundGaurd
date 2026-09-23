# GroundGuard — Architecture Decisions

This document records important project decisions.

Do not use it as a task list.

---

# Decision 001 — Node Is the Public API Gateway

**Status:** Accepted

### Decision

The browser communicates only with the Node backend.

```text
Browser
 ↓
Node
 ↓
Python services
```

### Reason

This centralizes:

* Authentication
* Authorization
* Request validation
* Persistence
* API versioning
* Streaming
* Error handling

---

# Decision 002 — Four Ownership Boundaries

**Status:** Accepted

```text
M1 = Grounding ML

M2 = RAG + LLM + Recovery

M3 = Backend + Platform

M4 = Frontend + DevOps
```

### Reason

Prevents duplicated implementation and unclear responsibility.

---

# Decision 003 — Claims Are First-Class Records

**Status:** Accepted

Generated answers are not stored only as one text blob.

Instead:

```text
Generation
 ↓
Claims
 ↓
Evidence
 ↓
Verification
```

### Reason

Enables claim-level grounding, recovery, metrics and UI.

---

# Decision 004 — M1 Uses NLI-Style Verification

**Status:** Accepted

The grounding model classifies:

```text
entailment
contradiction
neutral
```

### Reason

This provides an explicit claim/evidence relationship rather than relying only on semantic similarity.

---

# Decision 005 — Recovery Must Reverify

**Status:** Accepted

Recovered claims must go through M1 again.

```text
Recovery
 ↓
New claim
 ↓
M1
```

### Reason

Recovery output must not be trusted automatically.

---

# Decision 006 — Recovery Has Maximum Attempts

**Status:** Accepted

Recovery cannot loop indefinitely.

It terminates on:

```text
PASS
MAX_RETRIES
TIMEOUT
```

---

# Decision 007 — Mock Services Are Required

**Status:** Accepted

Members can develop against mock M1/M2 services.

### Reason

Parallel development should not depend on another member finishing first.

---

# Decision 008 — MVP Is Vertical-Slice First

**Status:** Accepted

First prove:

```text
Upload
 ↓
Retrieve
 ↓
Generate
 ↓
Verify
 ↓
Display
```

before investing heavily in advanced functionality.

---

# Decision 009 — Docker Compose for MVP Integration

**Status:** Accepted

The complete local MVP should run using Docker Compose.

---

# Decision 010 — Shared Contracts Are Frozen

**Status:** Accepted

API changes require coordinated updates.

A member should not silently change:

```text
request body
response body
status values
identifier names
error schema
```

without updating the shared contract.

---

# Decision 011 — Project Isolation Is Mandatory

**Status:** Accepted

Retrieval and all project-owned resources must remain project-scoped.

---

# Decision 012 — Advanced Features Come After MVP

**Status:** Accepted

The following are not allowed to block MVP:

```text
multimodal grounding
token-level intervention
KV-cache optimization
complex multi-agent systems
adaptive retrieval
```

---

# Decision 013 — Dedicated Vector Engine (Qdrant) & pgvector Retirement

**Status:** Accepted

### Decision

Use Qdrant as the single production dense vector engine (`http://localhost:6333`) and retire `pgvector` from active production runtime and database schema (executed in Migration 004).

### Reason

* Separation of concerns: PostgreSQL serves as the ACID transactional store for application truth and canonical chunk persistence; Qdrant provides optimized, isolated vector search with payload filtering.
* Deterministic rebuildability: Qdrant vectors can be rebuilt directly from PostgreSQL canonical chunk records.
* Avoids PostgreSQL extension and memory overhead in high-throughput vector indexing.

---

# Decision 014 — Multi-Store Knowledge Indexing Architecture

**Status:** Accepted

### Decision

Adopt a specialized 4-store knowledge indexing foundation for RAG:

1. **PostgreSQL (M3)**: Canonical application truth, lifecycle status, and canonical chunk text/lineage.
2. **Qdrant (M2)**: Production dense semantic vector index (Cosine, 384-dim, UUIDv5 IDs).
3. **Tantivy (M2)**: Production lexical BM25 search index on disk.
4. **NetworkX (M2)**: Production topological entity-relationship graph on disk.
5. **LanceDB (M2)**: Offline research and evaluation sandbox only (not on the online request path).

### Reason

Each storage engine fulfills a specialized retrieval requirement (dense semantics, exact BM25 keyword matching, structured entity graph traversal) while PostgreSQL maintains single canonical truth.

---

# Decision 015 — Authentication and Simple Project Ownership Authorization

**Status:** Accepted

### Decision

Implement authentication via `bcryptjs` (salt rounds=10) and standard JWT (HS256, 24h expiry). Enforce authorization via simple project ownership (`WHERE user_id = $1` in `ProjectRepository`) rather than complex multi-tenant RBAC.

### Reason

Simple project ownership satisfies all MVP security and project-isolation requirements with minimal complexity and maximum auditability.
