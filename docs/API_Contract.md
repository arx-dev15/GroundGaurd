# GroundGuard — API Contract

## 1. Contract Rules

These contracts are shared between all members.

Do not independently change request/response structures.

A contract change requires:

1. Announcement.
2. Contract update.
3. Type update.
4. Test update.
5. Documentation update.
6. Integration verification.

---

# 2. Common Identifiers

```text
userId
projectId
documentId
chunkId
conversationId
messageId
requestId
generationId
claimId
evidenceId
evaluationId
apiKeyId
```

---

# 3. Common Statuses

## Document

```text
uploaded
processing
ready
failed
```

## Generation

```text
queued
retrieving
generating
verifying
recovering
completed
failed
cancelled
```

## Claim

```text
pending
verified
flagged
recovered
needs_review
```

## Verification

```text
entailment
contradiction
neutral
```

---

# 4. Common Error Format

```json
{
  "error": {
    "code": "GENERATION_FAILED",
    "message": "Generation service unavailable"
  },
  "requestId": "req_123"
}
```

---

# 5. Public API

Base:

```text
/v1
```

---

## Authentication

```http
POST /auth/register
POST /auth/login
POST /auth/logout
GET /auth/me
```

---

## Projects

```http
POST /projects
GET /projects
GET /projects/:projectId
PATCH /projects/:projectId
DELETE /projects/:projectId
```

---

## Documents

```http
POST /projects/:projectId/documents
GET /projects/:projectId/documents
GET /documents/:documentId
GET /documents/:documentId/status
DELETE /documents/:documentId
```

---

## Conversations

```http
POST /projects/:projectId/conversations
GET /projects/:projectId/conversations
GET /conversations/:conversationId
GET /conversations/:conversationId/messages
```

---

## Generations

```http
POST /projects/:projectId/generations
GET /generations/:generationId
GET /generations/:generationId/events
POST /generations/:generationId/cancel
```

---

## Claims

```http
GET /generations/:generationId/claims
GET /claims/:claimId
GET /claims/:claimId/evidence
POST /claims/:claimId/retry
```

---

## Evaluation

```http
GET /projects/:projectId/metrics
GET /projects/:projectId/evaluations
POST /projects/:projectId/evaluations
GET /evaluations/:evaluationId
GET /evaluations/:evaluationId/results
```

---

## API Keys

```http
POST /api-keys
GET /api-keys
DELETE /api-keys/:keyId
```

These public endpoints follow the master project blueprint.

---

# 6. Create Generation

```http
POST /v1/projects/:projectId/generations
```

Request:

```json
{
  "query": "What was the revenue in 2024?",
  "conversationId": "conv_123",
  "options": {
    "stream": true,
    "maxRecoveryAttempts": 2
  }
}
```

Response:

```json
{
  "requestId": "req_123",
  "generationId": "gen_123",
  "status": "queued"
}
```

---

# 7. Generation Result

```json
{
  "requestId": "req_123",
  "generationId": "gen_123",
  "status": "completed",
  "answer": "Revenue was ₹50 Cr in 2024.",
  "claims": []
}
```

---

# 8. Claim Object

```json
{
  "claimId": "claim_1",
  "text": "Revenue was ₹50 Cr in 2024.",
  "status": "verified",
  "verification": {
    "label": "entailment",
    "scores": {
      "entailment": 0.97,
      "contradiction": 0.01,
      "neutral": 0.02
    },
    "groundingScore": 0.97,
    "modelVersion": "grounding-v1"
  },
  "evidence": []
}
```

---

# 9. Evidence Object

```json
{
  "evidenceId": "evidence_1",
  "chunkId": "chunk_1",
  "documentId": "doc_1",
  "text": "Revenue was ₹50 Cr in 2024.",
  "metadata": {
    "page": 12,
    "source": "annual-report.pdf"
  }
}
```

---

# 10. M2 Internal API

```http
POST /ingest
POST /retrieve
POST /generate
POST /recover
DELETE /documents/:documentId
```

### Ingest Request

```json
{
  "documentId": "doc_123",
  "projectId": "project_123",
  "filePath": "/data/documents/file.pdf"
}
```

### Ingest Response

```json
{
  "documentId": "doc_123",
  "status": "ready",
  "chunksCreated": 5,
  "indexStatus": {
    "qdrant": true,
    "tantivy": true,
    "networkx": true,
    "graphEdgesCount": 4
  },
  "chunks": [
    {
      "chunkId": "chunk_1",
      "documentId": "doc_123",
      "projectId": "project_123",
      "chunkIndex": 0,
      "pageNumber": 1,
      "section": "SECTION 4.2",
      "heading": "PUMP SPECIFICATIONS",
      "identifiers": [
        {
          "value": "V-204",
          "normalized": "V-204",
          "type": "vessel"
        }
      ],
      "text": "Vessel V-204 connects to pump P-101A...",
      "metadata": {
        "source": "manual.pdf",
        "page": 1
      }
    }
  ]
}
```

*Note on Ingestion Lifecycle:* M2 indexes the derived stores (Qdrant, Tantivy, NetworkX) and returns the extracted `chunks` list to M3. M3 is exclusively responsible for persisting these canonical chunks into PostgreSQL and updating the document status to `ready`.

### Retrieve Request

```json
{
  "projectId": "project_123",
  "query": "What was the revenue?",
  "topK": 5
}
```

### Recover Request

```json
{
  "requestId": "req_123",
  "claimId": "claim_1",
  "claim": "Revenue was ₹80 Cr.",
  "evidence": [],
  "failureReason": "contradiction"
}
```

M2 owns these internal AI contracts.

---

# 11. M1 Internal API

```http
POST /verify
POST /verify/batch
GET /health
GET /model/info
POST /evaluate
```

### Verify

```json
{
  "requestId": "req_123",
  "claimId": "claim_1",
  "claim": "Revenue was ₹80 Cr.",
  "evidence": [
    {
      "chunkId": "chunk_1",
      "text": "Revenue was ₹50 Cr."
    }
  ]
}
```

Response:

```json
{
  "requestId": "req_123",
  "claimId": "claim_1",
  "label": "contradiction",
  "scores": {
    "entailment": 0.01,
    "contradiction": 0.96,
    "neutral": 0.03
  },
  "groundingScore": 0.01,
  "modelVersion": "grounding-v1"
}
```

The M1 contract is defined around claim + evidence → classification + score + model version.

---

# 12. SSE Events

Endpoint:

```http
GET /v1/generations/:generationId/events
```

Events:

```text
generation.started
token.delta
sentence.verified
sentence.flagged
recovery.started
recovery.completed
generation.completed
generation.failed
```

Example:

```text
event: sentence.verified
data: {
  "claimId": "claim_1",
  "groundingScore": 0.97
}
```

---

# 13. Versioning

Public API:

```text
/v1
```

ML:

```text
modelVersion = grounding-v1
```

Internal service versions must not silently change response structures.
