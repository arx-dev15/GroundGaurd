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

*Implementation note:* While `retrieving` is retained in the contract specification for distributed pipelines, M3 currently executes retrieval and LLM generation atomically via M2's `/generate` endpoint. Active generations transition: `queued` → `generating` → `verifying` (or `recovering`) → `completed`/`failed`/`cancelled`. M3 does not persist a separate `retrieving` state in PostgreSQL.

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
GET /projects/:projectId/claims
GET /projects/:projectId/grounded-generations
```

---

## Documents

```http
POST /projects/:projectId/documents
GET /projects/:projectId/documents
GET /documents/:documentId
GET /documents/:documentId/status
GET /documents/:documentId/content
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

# 10. Project Canonical Claims

```http
GET /v1/projects/:projectId/claims
```

- **Method**: `GET`
- **Path**: `/v1/projects/:projectId/claims`
- **Auth Requirement**: JWT Bearer token required in `Authorization` header (`Bearer <token>`).
- **Ownership Requirement**: User must own or be authorized to access the project (`assertProjectAuthorized`).
- **Request Parameters**:
  - `projectId` (path, string, required): ID of the project whose canonical claims are requested.
- **Response Shape** (`application/json`, HTTP 200):

```json
{
  "claims": [
    {
      "claimId": "claim_47fd7a7a-199b-486f-b0a2-d3c8fb2665d6",
      "text": "Campus Monitor provides administrators with data-driven insights into environmental conditions...",
      "status": "needs_review",
      "ordinal": 1,
      "generationId": "gen_9bb9203b-6b27-468b-ad14-dc3697748213",
      "conversationId": "conv_c2c3248e-0f0a-49c3-98a3-669bde25fb55",
      "conversationTitle": "Smart Campus Q&A",
      "query": "what does campus monitor do",
      "createdAt": "2026-10-02T15:20:10.000Z",
      "verification": {
        "label": "neutral",
        "scores": {
          "entailment": 0.04,
          "contradiction": 0.01,
          "neutral": 0.95
        },
        "groundingScore": 0.04,
        "modelVersion": "grounding-v1"
      },
      "evidence": [
        {
          "evidenceId": "ev_1",
          "chunkId": "chunk_1",
          "documentId": "doc_46101de2-1a54-4381-adbe-0eff5882429f",
          "text": "Campus Monitor leverages IoT sensors...",
          "pageNumber": 2,
          "section": "1. Introduction"
        }
      ]
    }
  ]
}
```

- **Error Cases**:
  - `401 Unauthorized`: Missing or invalid JWT bearer token.
  - `403 Forbidden`: Authenticated user does not have permission to access the project.
  - `404 Not Found`: Project ID does not exist or does not belong to user.

---

# 11. Grounded Generations

```http
GET /v1/projects/:projectId/grounded-generations
```

- **Method**: `GET`
- **Path**: `/v1/projects/:projectId/grounded-generations`
- **Auth Requirement**: JWT Bearer token required in `Authorization` header.
- **Ownership Requirement**: User must own or be authorized to access the project.
- **Grounded Invariant**: Only generations possessing at least one factual claim (`HAVING COUNT(c.id) > 0`) are returned. Zero-claim social greetings (`hello`, `yo`) and project-boundary abstentions are excluded at the database level.
- **Request Parameters**:
  - `projectId` (path, string, required): ID of the project.
- **Response Shape** (`application/json`, HTTP 200):

```json
{
  "generations": [
    {
      "generationId": "gen_9bb9203b-6b27-468b-ad14-dc3697748213",
      "conversationId": "conv_c2c3248e-0f0a-49c3-98a3-669bde25fb55",
      "conversationTitle": "Smart Campus Q&A",
      "query": "what does campus monitor do",
      "createdAt": "2026-10-02T15:20:10.000Z",
      "claimCounts": {
        "total": 5,
        "verified": 4,
        "flagged": 0,
        "recovered": 0,
        "needsReview": 1
      },
      "sources": [
        "campus_monitor.pdf"
      ]
    }
  ]
}
```

- **Error Cases**:
  - `401 Unauthorized`: Missing or invalid JWT bearer token.
  - `403 Forbidden`: Authenticated user not authorized for project.
  - `404 Not Found`: Project ID does not exist.

---

# 12. Document Content (PDF Streaming)

```http
GET /v1/documents/:documentId/content
```

- **Method**: `GET`
- **Path**: `/v1/documents/:documentId/content`
- **Auth Requirement**: JWT Bearer token required in `Authorization` header (`Bearer <token>`). Query-string token authentication is not permitted.
- **Ownership Requirement**: Authenticated user must own the project containing the requested document. Cross-project document access is strictly forbidden.
- **Filesystem Security**: No absolute filesystem paths are accepted from or returned to the client. Path traversal outside the project storage sandbox is guarded with strict prefix matching.
- **Request Parameters**:
  - `documentId` (path, string, required): Unique document identifier.
- **Response Shape**:
  - **Content-Type**: `application/pdf`
  - **Body**: Raw PDF binary stream (HTTP 200).
- **Error Cases**:
  - `401 Unauthorized`: Unauthenticated request, missing `Authorization` header, or expired token.
  - `404 Not Found`: Inaccessible/cross-tenant document (user does not own the project that owns the document), non-existent document ID, or physical PDF file missing from disk.

---

# 13. M2 Internal API

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

### Generate Request (M3 → M2)

```json
{
  "projectId": "project_123",
  "query": "What voltage does the first one require?",
  "conversationId": "conv_123",
  "conversationContext": [
    {
      "role": "user",
      "content": "Compare the DHT11 and BMP280 sensors."
    },
    {
      "role": "assistant",
      "content": "The DHT11 sensor monitors humidity and ambient temperature, while the BMP280 is a barometric sensor."
    }
  ],
  "topK": 5
}
```

#### Conversation Context Semantics:
- **Ownership**: M3 owns conversation history and message persistence. M2 does not independently read database conversation tables.
- **Bounded Size**: M3 passes only a bounded recent window (maximum 2 full dialogue turns / 4 messages, capped at 1,000 characters).
- **Referent Resolution Only**: `conversationContext` is strictly used to resolve anaphoric references, pronouns, and comparative frames during query expansion and prompt generation.
- **Strict Evidence Isolation**: Conversation history is **NOT** factual evidence. LLM prompts strictly segregate dialogue history from retrieved project evidence blocks. All claims must be entailed by retrieved project chunks.

### Generate Response (M2 → M3)

```json
{
  "requestId": "req_123",
  "answer": "Based on the provided documentation, the DHT11 sensor requires an operating voltage of 3.5V to 5.5V DC.",
  "claims": [
    {
      "claimId": "claim_0",
      "text": "The DHT11 sensor requires an operating voltage of 3.5V to 5.5V DC.",
      "status": "pending",
      "ordinal": 0,
      "sourceText": "The DHT11 sensor requires an operating voltage of 3.5V to 5.5V DC.",
      "evidence": [
        {
          "chunkId": "chunk_1",
          "text": "The DHT11 sensor operating voltage is 3.5V to 5.5V DC.",
          "score": 0.94
        }
      ]
    }
  ]
}
```

### Recover Request (M3 → M2)

```json
{
  "requestId": "req_123",
  "claimId": "claim_1",
  "claim": "Revenue was ₹80 Cr.",
  "evidence": [],
  "failureReason": "contradiction"
}
```

### Recover Response (M2 → M3)

```json
{
  "requestId": "req_123",
  "claimId": "claim_1",
  "status": "recovered",
  "action": "rephrase",
  "candidate": "Revenue was ₹50 Cr in 2024.",
  "recoveryEvidence": [
    {
      "chunkId": "chunk_rec_1",
      "documentId": "doc_123",
      "text": "Annual revenue reached ₹50 Cr in FY 2024.",
      "score": 0.89
    }
  ]
}
```

#### Recovery Evidence Semantics:
- **Provenance**: `recoveryEvidence` contains candidate chunks specifically retrieved during the recovery workflow.
- **Separation**: Distinct from baseline original claim evidence.
- **Persistence & Auditability**: M3 persists `recoveryEvidence` in `claim_recovery_attempts.recovery_evidence` and exposes it in recovery attempt payloads for the frontend `RecoveryPlayback` component.
- **Verification Rule**: Recovery candidates must still be independently reverified by M1 NLI cross-encoder before the claim can transition to `recovered`.

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
