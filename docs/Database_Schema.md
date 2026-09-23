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
       │             └── Evidence
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
id
userId
name
description
createdAt
updatedAt
```

Relationship:

```text
User 1 ─── N Project
```

---

# 5. Document

```text
Document
```

Fields:

```text
id
projectId
name
filePath
mimeType
size
status
createdAt
updatedAt
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

Fields:

```text
id (UUID, PK)
document_id (UUID, FK -> documents.id)
text (TEXT, NOT NULL)
chunk_index (INTEGER, NOT NULL)
section (TEXT, NULLABLE) -- Added in migration 003 (e.g. "SECTION 4.2")
heading (TEXT, NULLABLE) -- Added in migration 003 (e.g. "PUMP SPECIFICATIONS")
identifiers (JSONB, DEFAULT '[]') -- Added in migration 003 ([{"value": "V-204", "normalized": "V-204", "type": "vessel"}])
metadata (JSONB, DEFAULT '{}') -- page, source file, etc.
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
id
requestId
projectId
conversationId
query
answer
status
retrievalLatencyMs
generationLatencyMs
verificationLatencyMs
totalLatencyMs
recoveryAttempts
createdAt
completedAt
```

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

# 12. Evaluation

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

# 13. APIKey

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

# 14. Important Indexes

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
Evidence.claimId
Evidence.chunkId
Evaluation.projectId
APIKey.projectId
```

---

# 15. Authorization Rule

Every project-owned entity must ultimately be traceable to:

```text
Project → User
```

M3 must verify ownership before access.

---

# 16. Important Storage Rule

Do not store the entire answer only as one JSON blob.

Store:

```text
Generation
 ↓
Claims
 ↓
Evidence
 ↓
Verification
```

This enables:

* claim-level UI
* evidence inspection
* metrics
* retries
* debugging
* evaluation

This structured claim/evidence approach is part of the original project design.

---

# 17. Knowledge & Vector Storage

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
