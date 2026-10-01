# GroundGuard — Database Schema

## 1. Database

Primary application database:

```text
PostgreSQL
```

M3 owns schema and migrations.

---

# 2. Entity Relationship

```text
User
 │
 └── Project
       │
       ├── Documents
       │      └── Chunks
       │
       ├── Conversations
       │      └── Messages
       │
       ├── Generations
       │      └── Claims
       │             ├── Evidence
       │             └── Recovery Attempts (claim_recovery_attempts)
       │
       ├── Evaluations
       │
       └── API Keys
```

---

# 3. User

```text
User
```

Fields:

```text
id
email
passwordHash
name
createdAt
updatedAt
```

---

# 4. Project

```text
Project
```

Fields:

```text
id (VARCHAR(64), PK)
user_id (VARCHAR(64), FK -> users.id ON DELETE CASCADE) -- Added in migration 011
name (VARCHAR(255), NOT NULL)
description (TEXT, NULLABLE)
created_at (TIMESTAMPTZ, DEFAULT NOW())
updated_at (TIMESTAMPTZ, DEFAULT NOW())
```

Relationship:

```text
User 1 ─── N Project (ON DELETE CASCADE)
```

---

# 5. Document

```text
Document
```

Fields (Canonical DB Columns per 002 migration):

```text
id (VARCHAR(64), PK)
project_id (VARCHAR(64), FK -> projects.id ON DELETE CASCADE)
filename (VARCHAR(255), NOT NULL)
file_path (VARCHAR(500), NOT NULL)
file_size (INTEGER, NOT NULL)
mime_type (VARCHAR(100), NOT NULL)
status (VARCHAR(50), NOT NULL, DEFAULT 'pending') -- 'pending', 'processing', 'ready', 'failed'
error_message (TEXT, NULLABLE)
chunks_count (INTEGER, DEFAULT 0)
created_at (TIMESTAMPTZ, DEFAULT NOW())
updated_at (TIMESTAMPTZ, DEFAULT NOW())
```

Relationship:

```text
Project 1 ─── N Document
```

---

# 6. Chunk

```text
Chunk
```

Fields (per 002 & 003 migrations):

```text
id (VARCHAR(64), PK)
document_id (VARCHAR(64), FK -> documents.id ON DELETE CASCADE)
text (TEXT, NOT NULL)
chunk_index (INTEGER, NOT NULL)
page_number (INTEGER, NULLABLE) -- Page provenance
section (TEXT, NULLABLE) -- Added in migration 003 (e.g. "SECTION 4.2")
heading (TEXT, NULLABLE) -- Added in migration 003 (e.g. "PUMP SPECIFICATIONS")
identifiers (JSONB, DEFAULT '[]') -- Added in migration 003 ([{"value": "V-204", "normalized": "V-204", "type": "vessel"}])
metadata (JSONB, DEFAULT '{}') -- source file, lineage, etc.
created_at (TIMESTAMPTZ, DEFAULT NOW())
```

*Note on Migration History:* Historical migration 002 initially defined an `embedding vector(384)` column. Migration 004 explicitly retired pgvector (`ALTER TABLE chunks DROP COLUMN IF EXISTS embedding; DROP EXTENSION IF EXISTS vector;`), transferring all dense embedding indexing to Qdrant.

Metadata example:

```json
{
  "page": 12,
  "source": "annual-report.pdf"
}
```

Relationship:

```text
Document 1 ─── N Chunk
```

---

# 7. Conversation

```text
Conversation
```

Fields:

```text
id
projectId
title
createdAt
updatedAt
```

---

# 8. Message

```text
Message
```

Fields:

```text
id
conversationId
role
content
createdAt
```

Roles:

```text
user
assistant
system
```

---

# 9. Generation

```text
Generation
```

Fields:

```text
id (VARCHAR(64), PK)
request_id (VARCHAR(64), NOT NULL)
project_id (VARCHAR(64), FK -> projects.id ON DELETE CASCADE)
conversation_id (VARCHAR(64), FK -> conversations.id ON DELETE SET NULL)
query (TEXT, NOT NULL)
answer (TEXT, NULLABLE)
status (VARCHAR(50), NOT NULL, DEFAULT 'queued')
  Allowed Statuses: 'queued', 'generating', 'verifying', 'recovering', 'completed', 'failed', 'cancelled'
error_code (VARCHAR(100), NULLABLE)
error_message (TEXT, NULLABLE)
model_version (VARCHAR(100), NULLABLE)
metadata (JSONB, DEFAULT '{}')
retrieval_latency_ms (INTEGER, NULLABLE)
generation_latency_ms (INTEGER, NULLABLE)
verification_latency_ms (INTEGER, NULLABLE)
total_latency_ms (INTEGER, NULLABLE)
recovery_attempts (INTEGER, DEFAULT 0)
max_recovery_attempts (INTEGER, DEFAULT 2)
created_at (TIMESTAMPTZ, DEFAULT NOW())
completed_at (TIMESTAMPTZ, NULLABLE)
updated_at (TIMESTAMPTZ, DEFAULT NOW())
```

*Note on `retrieving`:* While `@groundguard/contracts` and `@groundguard/types` retain `'retrieving'` as a permissible contract state for future distributed retrieval workers, M3 currently delegates retrieval and generation atomically to M2's `/generate` endpoint. The generation lifecycle therefore transitions through: `queued` → `generating` → `verifying` (or `recovering`) → `completed`/`failed`/`cancelled`. M3 does not persist `retrieving` separately in PostgreSQL because M2 encapsulates retrieval.

---

# 10. Claim

```text
Claim
```

Fields:

```text
id
generationId
text
status
label
entailmentScore
contradictionScore
neutralScore
groundingScore
modelVersion
createdAt
updatedAt
```

Relationship:

```text
Generation 1 ─── N Claim
```

---

# 11. Evidence

```text
Evidence
```

Fields:

```text
id
claimId
chunkId
documentId
text
retrievalScore
metadata
createdAt
```

Relationship:

```text
Claim 1 ─── N Evidence
```

---

# 12. Claim Recovery Attempt

```text
ClaimRecoveryAttempt (claim_recovery_attempts)
```

Introduced in migration `008_claim_recovery_attempts.sql` and enhanced in migration `011_recovery_attempt_evidence.sql`.

Fields:

```text
id (VARCHAR(64), PK)
claim_id (VARCHAR(64), FK -> claims.id ON DELETE CASCADE)
attempt_number (INTEGER, NOT NULL)
failure_reason (VARCHAR(64), NOT NULL)
action (VARCHAR(32), NOT NULL)
original_text (TEXT, NOT NULL)
candidate_text (TEXT, NULLABLE)
verification_label (VARCHAR(32), NULLABLE)
entailment_score (DOUBLE PRECISION, NULLABLE)
contradiction_score (DOUBLE PRECISION, NULLABLE)
neutral_score (DOUBLE PRECISION, NULLABLE)
grounding_score (DOUBLE PRECISION, NULLABLE)
model_version (VARCHAR(64), NULLABLE)
recovery_model_version (VARCHAR(64), NULLABLE)
recovery_evidence (JSONB, NULLABLE) -- Added in migration 011: recovery-specific evidence chunks [{ chunkId, documentId, text, score }]
created_at (TIMESTAMPTZ, NOT NULL)
```

Constraints:

```text
UNIQUE (claim_id, attempt_number)
INDEX idx_claim_recovery_attempts_claim_id (claim_id)
```

Relationship:

```text
Claim 1 ─── N ClaimRecoveryAttempt (ON DELETE CASCADE)
```

---

# 13. Evaluation

```text
Evaluation
```

Fields:

```text
id
projectId
name
status
createdAt
completedAt
```

---

# 14. APIKey

```text
APIKey
```

Fields:

```text
id
projectId
name
keyHash
lastUsedAt
createdAt
revokedAt
```

---

# 15. Important Indexes

At minimum:

```text
Project.userId
Document.projectId
Chunk.documentId
Conversation.projectId
Message.conversationId
Generation.projectId
Generation.requestId
Generation.conversationId
Claim.generationId
ClaimRecoveryAttempt.claimId
Evidence.claimId
Evidence.chunkId
Evaluation.projectId
APIKey.projectId
```

---

# 16. Authorization Rule

Every project-owned entity must ultimately be traceable to:

```text
Project → User
```

M3 must verify ownership before access.

---

# 17. Important Storage Rule

Do not store the entire answer only as one JSON blob.

Store:

```text
Generation
 ↓
Claims
 ↓
Evidence
 ↓
Recovery Attempts (with recovery-specific evidence)
```

This enables:

* claim-level UI
* evidence inspection
* recovery playback and verification audit
* metrics
* retries
* debugging
* evaluation

This structured claim/evidence approach is part of the original project design.

---

# 18. Knowledge & Vector Storage

PostgreSQL is the single canonical source of truth for all persistent application state and canonical chunk text (owned by M3).

M2 owns the derived retrieval and search indexes:

1. **Qdrant (Dense Semantic Vector Store)**
   * Single production dense vector engine (`http://localhost:6333`).
   * 384-dimensional embeddings (`sentence-transformers/all-MiniLM-L6-v2`) with Cosine distance.
   * UUIDv5 point IDs deterministically generated from `(projectId, documentId, chunkIndex)`.
   * Payload keyword indexes for project isolation, document filtering, and technical identifier matching.

2. **Tantivy (Lexical BM25 Search Store)**
   * Production BM25 text index on disk (`uploads/indexes/tantivy`).
   * Project-scoped Boolean query filtering.

3. **NetworkX (Entity Relationship Graph Store)**
   * Production topological relationship graph (`uploads/graphs/:projectId/topology.json`).
   * Connects normalized technical identifiers (`V-204`, `P-101A`) with directed edges (`upstream_of`, `downstream_of`, `connected_to`) and chunk-level provenance.

4. **LanceDB (Offline Research Sandbox)**
   * Standalone embedded vector store for offline evaluation and experimental benchmarking only. Not on the online request path.

5. **pgvector (Retired)**
   * Fully retired from production in Migration 004. Retained solely in historical migration 002 for audit trails.
