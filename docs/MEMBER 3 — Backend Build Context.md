Absolutely. Here is the **isolated Member 3 build context**.

# MEMBER 3 — COMPLETE BUILD CONTEXT

## GroundGuard — Backend + Platform Integration Engineer

This context is **only for Member 3**. Your job is to build the central backend that connects the frontend, database, AI service, ML service, authentication, persistence, streaming, and public API.

The project blueprint assigns M3 ownership of **Node.js + TypeScript backend, PostgreSQL, Redis where needed, authentication, projects, documents, conversations, generation orchestration, persistence, SSE, and the stable external API**. 

---

# 1. Your role

You are:

> **Member 3 — Backend + Platform Integration Engineer**

Your subsystem is the **control center** of GroundGuard.

You do not build the AI intelligence itself.

Instead, you coordinate:

```text
Frontend
   ↓
Node API
   ↓
Python AI service
   ↓
ML verification
   ↓
Node API
   ↓
Database
   ↓
Frontend
```

Your backend turns the separate M1 and M2 components into one usable product.

---

# 2. Your ownership

## You OWN

```text
Node.js backend
TypeScript
Fastify / Express
REST API
Authentication
Authorization
Projects
Documents metadata
Conversations
Messages
Generation requests
Generation persistence
Claims persistence
Evidence persistence
Evaluation persistence
API keys
SSE
Request orchestration
Calling M2
Calling M1 indirectly/directly where appropriate
PostgreSQL
Redis usage where needed
API validation
Error handling
Public API contracts
Backend tests
```

The blueprint explicitly assigns M3 the stable external API and persistence/orchestration layer. 

---

# 3. You DO NOT OWN

Do not build:

```text
❌ ML model training
❌ DeBERTa/RoBERTa training
❌ ML inference implementation
❌ PDF parsing
❌ Chunking logic
❌ Embedding generation
❌ Vector retrieval
❌ Reranking
❌ LLM prompting
❌ LangGraph recovery logic
❌ Next.js UI
❌ Frontend state management
❌ Frontend design
❌ CI/CD ownership
```

Those belong to M1, M2, and M4.

---

# 4. Your service

Recommended:

```text
Node.js
TypeScript
Fastify
```

Development:

```text
http://localhost:4000
```

Docker:

```text
http://api:4000
```

M2:

```text
http://ai:8000
```

M1:

```text
http://ml:8001
```

---

# 5. Your directory

Recommended:

```text
apps/api/
│
├── src/
│   ├── app.ts
│   ├── server.ts
│   │
│   ├── config/
│   │   └── env.ts
│   │
│   ├── plugins/
│   │   ├── auth.ts
│   │   ├── database.ts
│   │   └── redis.ts
│   │
│   ├── routes/
│   │   ├── auth.ts
│   │   ├── projects.ts
│   │   ├── documents.ts
│   │   ├── conversations.ts
│   │   ├── generations.ts
│   │   ├── claims.ts
│   │   ├── evaluations.ts
│   │   └── api-keys.ts
│   │
│   ├── services/
│   │   ├── auth.service.ts
│   │   ├── project.service.ts
│   │   ├── document.service.ts
│   │   ├── conversation.service.ts
│   │   ├── generation.service.ts
│   │   ├── claim.service.ts
│   │   └── evaluation.service.ts
│   │
│   ├── clients/
│   │   ├── ai.client.ts
│   │   └── ml.client.ts
│   │
│   ├── repositories/
│   │   ├── user.repository.ts
│   │   ├── project.repository.ts
│   │   ├── document.repository.ts
│   │   ├── chunk.repository.ts
│   │   ├── generation.repository.ts
│   │   └── claim.repository.ts
│   │
│   ├── schemas/
│   │   └── ...
│   │
│   └── utils/
│       ├── errors.ts
│       ├── request-id.ts
│       └── pagination.ts
│
├── tests/
├── Dockerfile
├── package.json
└── README.md
```

The exact internal organization is yours; the public API contract is the important part.

---

# 6. Core architecture

Your backend sits here:

```text
                       ┌──────────────┐
                       │   Next.js    │
                       │     M4       │
                       └──────┬───────┘
                              │
                         REST + SSE
                              │
                              ▼
                     ┌────────────────┐
                     │   Node API     │
                     │      M3        │
                     └───────┬────────┘
                             │
             ┌───────────────┼────────────────┐
             │               │                │
             ▼               ▼                ▼
        PostgreSQL         Redis             M2
                                             AI
                                             │
                                             ▼
                                            M1
                                            ML
```

The overall architecture in the blueprint follows this separation. 

---

# 7. Your most important responsibility

The backend must make this entire flow work:

```text
User asks question
      ↓
M3 validates request
      ↓
M3 creates generation
      ↓
M3 calls M2
      ↓
M2 retrieves evidence
      ↓
M2 generates answer
      ↓
M2 verifies through M1
      ↓
M2 optionally performs recovery
      ↓
M2 returns final result
      ↓
M3 persists result
      ↓
M3 exposes result to frontend
```

This is your primary job.

---

# 8. Database ownership

M3 owns the application database.

The blueprint defines this model:

```text
User
 └── Project
      ├── Documents
      │    └── Chunks
      ├── Conversations
      │    └── Messages
      ├── Generations
      │    └── Claims
      │         └── Evidence
      ├── Evaluations
      └── API Keys
```



---

# 9. Core database entities

You need at least:

```text
User
Project
Document
Chunk
Conversation
Message
Generation
Claim
Evidence
Evaluation
APIKey
```

Do not reduce the entire generation to one giant JSON blob.

The blueprint explicitly requires structured claim/evidence records. 

---

# 10. User

Conceptually:

```text
User
----
id
email
passwordHash
createdAt
updatedAt
```

Never store plaintext passwords.

---

# 11. Project

```text
Project
-------
id
userId
name
description
createdAt
updatedAt
```

A user can have multiple projects.

---

# 12. Project isolation

Every project-owned resource must be scoped.

For example:

```text
projectId
```

must be checked before allowing access to:

```text
documents
conversations
generations
claims
evaluations
```

User A must never access User B's project.

This is a fundamental authorization requirement.

---

# 13. Document

M3 stores document metadata.

Example:

```text
Document
--------
id
projectId
filename
mimeType
storagePath
status
createdAt
updatedAt
```

M2 handles parsing/chunking.

M3 tracks the document's application-level lifecycle.

---

# 14. Document lifecycle

Frozen status values:

```text
uploaded
processing
ready
failed
```

Freeze these values as a shared contract.

Do not let different services invent different status names.

---

# 15. Chunk (Canonical Persistence)

M3 is the **exclusive canonical writer of document chunks to PostgreSQL** (`chunkRepository.saveChunks`).

PostgreSQL Schema:

```text
Chunk
-----
id (UUID, PK)
document_id (UUID, FK -> documents.id)
text (TEXT, NOT NULL)
chunk_index (INTEGER, NOT NULL)
section (TEXT, NULLABLE) -- Lineage
heading (TEXT, NULLABLE) -- Lineage
identifiers (JSONB)      -- Technical normalized entities
metadata (JSONB)         -- Page, source file, etc.
created_at (TIMESTAMPTZ)
```

**Ingestion Workflow:**
1. Public upload via M3 `POST /projects/:projectId/documents`.
2. M3 sets document status to `processing` and calls M2 `/ingest`.
3. M2 handles PDF text extraction, lineage chunking, embeddings, and derived store indexing (Qdrant, Tantivy, NetworkX).
4. M2 returns the extracted `chunks` list to M3.
5. M3 persists the canonical chunk records into PostgreSQL and updates document status to `ready`.

---

# 16. Conversation

```text
Conversation
------------
id
projectId
title
createdAt
updatedAt
```

---

# 17. Message

```text
Message
-------
id
conversationId
role
content
createdAt
```

Possible roles:

```text
user
assistant
system
```

Do not allow arbitrary roles from clients.

---

# 18. Generation

This is one of your most important entities.

Conceptually:

```text
Generation
----------
id
conversationId
projectId
requestId
query
status
answer
modelVersion
startedAt
completedAt
latencyMs
recoveryAttempts
```

Potential status:

```text
queued
running
completed
failed
cancelled
```

---

# 19. Claim

Each generated factual claim should be separately persisted.

```text
Claim
-----
id
generationId
text
status
groundingScore
modelVersion
recoveryAttempts
createdAt
```

Possible status:

```text
pending
entailed
contradiction
neutral
recovered
failed
```

Coordinate the final enum with M1/M2.

---

# 20. Evidence

Evidence connects claims to source material.

Conceptually:

```text
Evidence
--------
id
claimId
chunkId
documentId
text
retrievalScore
page
source
```

This lets the frontend eventually show:

```text
Claim
 ↓
Evidence
 ↓
Document
 ↓
Page
```

---

# 21. Evaluation

```text
Evaluation
----------
id
projectId
type
status
metrics
createdAt
completedAt
```

M4 will eventually display evaluation results.

M3 provides the API and persistence.

M1/M2 provide relevant metrics.

---

# 22. API keys

For developer access:

```text
APIKey
------
id
userId
name
keyHash
lastUsedAt
createdAt
revokedAt
```

Never store the raw secret after creation if the design uses one-time display.

---

# 23. Public API base path

All public endpoints use:

```text
/v1
```

The blueprint defines the following API surface. 

---

# 24. Authentication endpoints

```http
POST /v1/auth/register
POST /v1/auth/login
POST /v1/auth/logout
GET  /v1/auth/me
```

---

# 25. Registration

```http
POST /v1/auth/register
```

Request:

```json
{
  "email": "user@example.com",
  "password": "..."
}
```

Return a safe user/session representation.

Never return:

```text
password
passwordHash
internal auth secrets
```

---

# 26. Login

```http
POST /v1/auth/login
```

Validate:

```text
email
password
```

Then establish the authentication mechanism chosen by the team.

Keep the mechanism consistent across web and API-key authentication.

---

# 27. Projects

```http
POST   /v1/projects
GET    /v1/projects
GET    /v1/projects/:projectId
PATCH  /v1/projects/:projectId
DELETE /v1/projects/:projectId
```

Every project operation requires authorization.

---

# 28. Documents

```http
POST /v1/projects/:projectId/documents
GET  /v1/projects/:projectId/documents
GET  /v1/documents/:documentId
GET  /v1/documents/:documentId/status
DELETE /v1/documents/:documentId
```

M3 handles the API and metadata.

M2 handles the AI ingestion pipeline.

---

# 29. Upload flow

Recommended:

```text
Frontend
   ↓
POST document
   ↓
M3 stores file/metadata
   ↓
M3 creates document
   ↓
M3 calls M2 /ingest
   ↓
M2 processes document
   ↓
M3 updates document status
```

Do not put PDF parsing inside Node.

---

# 30. Conversation endpoints

```http
POST /v1/projects/:projectId/conversations
GET  /v1/projects/:projectId/conversations
GET  /v1/conversations/:conversationId
GET  /v1/conversations/:conversationId/messages
```

M3 owns persistence.

---

# 31. Generation endpoints

```http
POST /v1/projects/:projectId/generations
GET  /v1/generations/:generationId
GET  /v1/generations/:generationId/events
POST /v1/generations/:generationId/cancel
```

These are the heart of the platform.

---

# 32. Generation request flow

Client:

```http
POST /v1/projects/project_123/generations
```

Body conceptually:

```json
{
  "conversationId": "conv_123",
  "query": "What was the revenue?",
  "options": {
    "stream": true,
    "maxRecoveryAttempts": 2
  }
}
```

M3 should:

```text
1. Authenticate
2. Authorize project
3. Validate request
4. Generate requestId
5. Create Generation
6. Call M2
7. Persist results
8. Return generationId
```

---

# 33. requestId

Every request must have a `requestId`.

The blueprint explicitly requires this. 

Example:

```text
req_01KABC...
```

Use it throughout:

```text
Frontend
 ↓
Node
 ↓
M2
 ↓
M1
 ↓
Node
```

This allows debugging a complete request.

---

# 34. requestId vs generationId

Keep them separate.

### requestId

Tracks a request/trace.

### generationId

Tracks the persisted generation object.

Example:

```text
requestId:
req_123

generationId:
gen_456
```

---

# 35. M3 → M2

Your AI client should have something like:

```text
AIClient.generate()
AIClient.ingest()
AIClient.retrieve()
AIClient.recover()
```

M3 should not know how M2 internally performs retrieval.

---

# 36. M2 URL

Development:

```text
http://localhost:8000
```

Docker:

```text
http://ai:8000
```

Use configuration rather than hardcoding.

---

# 37. M1 URL

Development:

```text
http://localhost:8001
```

Docker:

```text
http://ml:8001
```

M3 generally shouldn't reproduce M1 logic.

M2 is expected to orchestrate verification as part of its AI pipeline.

---

# 38. Important ownership distinction

Think of it this way:

```text
M1:
"Is this claim grounded?"

M2:
"What evidence should we retrieve, what should the LLM generate,
and how do we recover failed claims?"

M3:
"How does the whole product request, store, expose,
authorize, and stream this process?"

M4:
"How does the user interact with and visualize it?"
```

This distinction prevents duplicated architecture.

---

# 39. `/generations/:generationId`

Endpoint:

```http
GET /v1/generations/:generationId
```

Should return persisted generation state.

Example:

```json
{
  "generationId": "gen_123",
  "requestId": "req_123",
  "status": "completed",
  "answer": "The company generated ₹50 Cr.",
  "recoveryAttempts": 1
}
```

Claims can either be embedded according to the agreed API contract or fetched separately.

---

# 40. Claims endpoints

```http
GET /v1/generations/:generationId/claims
GET /v1/claims/:claimId
GET /v1/claims/:claimId/evidence
POST /v1/claims/:claimId/retry
```

These are explicitly part of the blueprint's public API. 

---

# 41. Claim retry

When:

```http
POST /v1/claims/:claimId/retry
```

is called:

```text
Frontend
 ↓
M3
 ↓
M2 recovery
 ↓
M1 verification
 ↓
M3 persists result
 ↓
Frontend
```

Do not implement recovery logic in Node.

Node orchestrates.

M2 recovers.

M1 verifies.

---

# 42. SSE

One of your biggest responsibilities is streaming.

Endpoint:

```http
GET /v1/generations/:generationId/events
```

The blueprint specifically calls for SSE generation events. 

---

# 43. Suggested SSE events

```text
generation.started
token.delta
sentence.verified
sentence.flagged
generation.completed
generation.failed
```

The exact payload contracts should be frozen with M4.

---

# 44. Example SSE flow

```text
generation.started
        ↓
token.delta
        ↓
token.delta
        ↓
sentence.verified
        ↓
token.delta
        ↓
sentence.flagged
        ↓
recovery.started
        ↓
sentence.verified
        ↓
generation.completed
```

This allows M4 to build a live research/chat experience.

---

# 45. SSE principle

M3 should stream **events**, not internal implementation details.

Don't expose:

```text
LangGraph node names
Python stack traces
database queries
internal prompts
secret model configuration
```

Expose product-level events.

---

# 46. Persistence during streaming

Don't wait until the entire process finishes before creating everything.

Recommended:

```text
Generation created
     ↓
status = running
     ↓
events streamed
     ↓
claims persisted
     ↓
evidence persisted
     ↓
generation completed
```

This allows the user to inspect a generation even if something fails later.

---

# 47. Error schema

Freeze one common error structure.

For example:

```json
{
  "error": {
    "code": "DOCUMENT_NOT_FOUND",
    "message": "Document was not found.",
    "requestId": "req_123"
  }
}
```

Every service-facing API error should be traceable to `requestId`.

---

# 48. Useful error codes

Potential initial set:

```text
UNAUTHORIZED
FORBIDDEN
NOT_FOUND
VALIDATION_ERROR
DOCUMENT_NOT_FOUND
DOCUMENT_PROCESSING_FAILED
GENERATION_FAILED
AI_SERVICE_UNAVAILABLE
ML_SERVICE_UNAVAILABLE
GENERATION_CANCELLED
RATE_LIMITED
INTERNAL_ERROR
```

Freeze the actual list in shared contracts.

---

# 49. Validation

Use:

```text
Zod
```

or the Fastify schema system.

Validate:

```text
request body
query parameters
path parameters
headers
```

Never trust frontend input.

---

# 50. Authorization

For every resource:

```text
Who owns it?
Which project does it belong to?
Does the current user have access?
```

For example:

```text
GET /v1/documents/doc_123
```

should not simply query:

```sql
WHERE id = 'doc_123'
```

It must also verify ownership/project access.

---

# 51. API-key access

Developer APIs eventually use:

```text
X-API-Key
```

or an equivalent scheme.

The exact header can be finalized later.

The important architecture is:

```text
API key
 ↓
hash/lookup
 ↓
user
 ↓
project authorization
 ↓
request
```

Never trust a project ID supplied by an API client without authorization checks.

---

# 52. Database technology

The blueprint specifies:

```text
PostgreSQL
```

and allows:

```text
Prisma
Drizzle
```

for the application layer. 

Choose one and standardize it.

Do not have half the backend using Prisma and half using raw SQL without a clear reason.

---

# 53. Migrations

M3 owns database migrations.

Every schema change should be:

```text
migration
 ↓
local test
 ↓
integration test
 ↓
PR
```

Never manually alter production schema without a migration.

---

# 54. Redis

Redis is optional where useful.

Potential uses:

```text
session/cache
generation state
rate limiting
short-lived SSE state
job coordination
```

Don't introduce Redis merely because the architecture mentions it.

Use it when it solves a concrete backend problem.

---

# 55. Document processing orchestration

M3 should not block the API waiting for a huge PDF to finish processing.

Preferred conceptual flow:

```text
POST document
      ↓
create document
      ↓
status = processing
      ↓
trigger M2
      ↓
return documentId
```

Then:

```text
GET /documents/:documentId/status
```

can report:

```text
processing
completed
failed
```

---

# 56. Generation orchestration

The same principle applies to long generations.

Your backend should be capable of:

```text
create generation
 ↓
run AI pipeline
 ↓
stream events
 ↓
persist results
```

rather than making the HTTP request itself responsible for every implementation detail.

---

# 57. Cancellation

Endpoint:

```http
POST /v1/generations/:generationId/cancel
```

Cancellation should propagate as far as practical:

```text
Frontend
 ↓
M3
 ↓
M2
 ↓
stop generation/recovery
```

Don't simply mark a database row as cancelled while the Python process continues indefinitely.

The exact cancellation mechanics should be coordinated with M2.

---

# 58. Evaluation endpoints

The blueprint defines:

```http
GET  /v1/projects/:projectId/metrics
GET  /v1/projects/:projectId/evaluations
POST /v1/projects/:projectId/evaluations
GET  /v1/evaluations/:evaluationId
GET  /v1/evaluations/:evaluationId/results
```



M3 owns these public endpoints.

M1/M2 provide evaluation information.

M4 displays it.

---

# 59. Metrics

Potential metrics:

```text
grounding rate
contradiction count
verification latency
retrieval latency
generation latency
recovery attempts
model version
request trace
```

These are specifically called out in the project blueprint for the evaluation dashboard. 

---

# 60. Don't calculate ML metrics incorrectly

M3 should not invent:

```text
groundingScore
```

or reinterpret M1's model outputs.

M1 owns the semantics of ML scores.

M3 stores and exposes them.

M4 visualizes them.

---

# 61. Model version

Every ML result should contain:

```text
modelVersion
```

The project rules explicitly require this. 

Persist it with claims/verifications where appropriate.

Example:

```text
grounding-v1
```

Later:

```text
grounding-v2
```

This allows evaluation comparison across model versions.

---

# 62. Request tracing

A complete request should be traceable:

```text
requestId
   │
   ├── generationId
   │
   ├── M2 request
   │
   ├── M1 verification
   │
   ├── claim IDs
   │
   └── evidence IDs
```

This becomes extremely useful when debugging hallucination reports.

---

# 63. Logging

Log structured events.

Example:

```json
{
  "event": "generation.completed",
  "requestId": "req_123",
  "generationId": "gen_456",
  "latencyMs": 1840
}
```

Don't log:

```text
passwords
API keys
tokens
authorization headers
sensitive secrets
```

---

# 64. Backend testing

You need several layers.

### Unit tests

```text
auth service
project authorization
validation
generation state transitions
error mapping
```

### Integration tests

```text
PostgreSQL
AI client
generation persistence
document lifecycle
```

### API tests

```text
POST /auth/register
POST /projects
POST /documents
POST /generations
GET /claims
GET /evidence
```

### E2E

At least one complete flow:

```text
register
 ↓
create project
 ↓
upload document
 ↓
process
 ↓
ask question
 ↓
generation
 ↓
claim
 ↓
evidence
 ↓
final answer
```

---

# 65. Mock M2 early

Do not wait for M2 to finish.

Create a mock AI service.

Example:

```json
{
  "requestId": "req_123",
  "status": "completed",
  "answer": "The company generated ₹50 Cr.",
  "claims": [
    {
      "claimId": "claim_1",
      "text": "The company generated ₹50 Cr.",
      "status": "entailed",
      "groundingScore": 0.97,
      "evidence": [
        {
          "chunkId": "chunk_1",
          "documentId": "doc_1"
        }
      ]
    }
  ]
}
```

Now M3 can build the entire backend without waiting.

This follows the project's rule to use mocks so members can develop independently. 

---

# 66. Mock frontend early

Likewise, test API responses using:

```text
curl
Postman
HTTP tests
```

before M4 is finished.

Your backend should be usable independently.

---

# 67. Contract with M2

M2 owns:

```text
/ingest
/retrieve
/generate
/recover
```

You consume those internal services.

Do not assume undocumented response fields.

Freeze the contract.

---

# 68. Critical `/generate` collaboration

This is the most important cross-member contract.

M2 owns the AI implementation.

M3 owns the public API.

Therefore:

```text
M2 + M3
      ↓
final generation contract
```

Decide:

```text
request
response
claim schema
evidence schema
status values
error format
streaming events
recovery fields
latency fields
modelVersion
```

before final integration.

---

# 69. M3 ↔ M4 contract

M4 should only need:

```text
/v1/*
```

M4 should never call:

```text
:8000
:8001
```

directly.

The blueprint explicitly states:

> Frontend only talks to Node API.



This rule should never be broken.

---

# 70. Security boundary

Architecture should be:

```text
Browser
  ↓
Node
  ↓
Python
```

not:

```text
Browser
  ├── Node
  ├── M2
  └── M1
```

M1/M2 should be internal services.

---

# 71. File storage

M3 owns the application-level document upload flow.

Depending on the MVP, files may be stored in:

```text
local volume
object storage
```

The important part is that M2 receives a valid file reference.

Don't couple M2 to frontend upload implementation.

---

# 72. End-to-end example

User asks:

> What was the company's revenue?

M3:

```text
authenticate
 ↓
authorize project
 ↓
create generation
 ↓
requestId = req_123
```

M3 → M2:

```json
{
  "requestId": "req_123",
  "projectId": "project_1",
  "query": "What was the company's revenue?"
}
```

M2:

```text
retrieve
 ↓
LLM
 ↓
claim extraction
 ↓
M1
```

M1:

```text
contradiction
```

M2:

```text
recovery
 ↓
new evidence
 ↓
regenerate
 ↓
M1
 ↓
entailment
```

M2 returns:

```text
final answer
claims
evidence
scores
recovery info
```

M3:

```text
persist everything
 ↓
generation.completed
 ↓
frontend
```

M4 displays it.

---

# 73. Final database relationship

Keep this mental model:

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

This is the central persistence model defined by the blueprint. 

---

# 74. Recommended implementation order

## Phase 1 — Backend skeleton

```text
Fastify
TypeScript
config
health
error handling
requestId
```

---

## Phase 2 — Database

```text
PostgreSQL
ORM
migrations
User
Project
Document
Conversation
Message
Generation
Claim
Evidence
Evaluation
APIKey
```

---

## Phase 3 — Authentication

```text
register
login
logout
me
authorization
```

---

## Phase 4 — Projects

```text
create
list
get
update
delete
```

---

## Phase 5 — Documents

```text
upload
metadata
status
delete
M2 ingestion integration
```

---

## Phase 6 — Conversations

```text
create
list
messages
```

---

## Phase 7 — Generation

```text
create generation
M2 integration
persist result
claims
evidence
```

---

## Phase 8 — SSE

```text
generation.started
token.delta
sentence.verified
sentence.flagged
generation.completed
```

---

## Phase 9 — Recovery/retry

```text
claim retry
M2 recovery
persist updated claim
```

---

## Phase 10 — Developer API

```text
API keys
authentication
rate limits if required
stable external contract
```

---

## Phase 11 — Evaluation

```text
metrics
evaluations
results
```

---

# 75. M3 acceptance criteria

You are complete when:

```text
[ ] Node API runs independently
[ ] TypeScript is configured
[ ] PostgreSQL works
[ ] Migrations work
[ ] Authentication works
[ ] Authorization works
[ ] Projects work
[ ] Documents work
[ ] Document status works
[ ] Conversations work
[ ] Messages persist
[ ] Generation requests work
[ ] M2 integration works
[ ] Generation results persist
[ ] Claims persist individually
[ ] Evidence persists individually
[ ] Model version persists
[ ] requestId propagates
[ ] SSE works
[ ] Generation cancellation exists
[ ] Claim retry works
[ ] Evaluation endpoints work
[ ] API keys work
[ ] Error schema is consistent
[ ] Frontend never needs direct M1/M2 access
[ ] Mock M2 works
[ ] Integration tests exist
[ ] E2E test exists
[ ] Docker works
[ ] README exists
```

---

# 76. What success looks like

M3 should eventually make this possible:

```text
                     GROUNDGUARD
                          │
                    ┌─────▼─────┐
                    │  Next.js  │
                    │    M4     │
                    └─────┬─────┘
                          │
                     REST / SSE
                          │
                    ┌─────▼─────┐
                    │  NODE API  │
                    │    M3      │
                    └─────┬─────┘
                          │
             ┌────────────┼────────────┐
             │            │            │
             ▼            ▼            ▼
          Postgres      Redis         M2
                                      │
                                RAG + LLM
                                      │
                                      ▼
                                     M1
                                      │
                                   Grounding
```

### Your one-line responsibility:

> **M3 is the platform control center that turns M1's grounding model and M2's RAG/recovery engine into a secure, persistent, streamable, externally usable GroundGuard API.**

The most important rule for M3 is: **don't become another AI service.** Your strength is orchestration, contracts, persistence, security, and making the entire system behave as one product.
