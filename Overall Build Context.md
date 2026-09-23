# GroundGuard

## Complete Integrated MVP Build Context

### Project Definition

**GroundGuard — Evidence-grounded AI reliability platform**

The system allows a user to:

1. Create a project.
2. Upload documents.
3. Build a searchable knowledge base.
4. Ask questions.
5. Retrieve relevant evidence.
6. Generate an answer using an LLM.
7. Split the answer into claims/sentences.
8. Verify each claim against evidence using an ML grounding model.
9. Detect entailment, contradiction, or unsupported claims.
10. Recover failed claims when possible.
11. Return the final answer with sources and grounding information.
12. Display the complete process through a web application.

The central idea is:

```text
RAG finds evidence
       ↓
LLM generates answer
       ↓
ML verifies claims
       ↓
Failed claims trigger recovery
       ↓
Final verified answer
```

This is the single product that all four members are building.

---

# 1. THE BIG PICTURE

The entire project should be understood as four layers.

```text
                    USER
                     │
                     ▼
             ┌─────────────────┐
             │   M4 FRONTEND   │
             │    Next.js      │
             └────────┬────────┘
                      │
                 REST + SSE
                      │
                      ▼
             ┌─────────────────┐
             │   M3 BACKEND    │
             │ Node + TS       │
             │ API + DB        │
             └───────┬─────────┘
                     │
            ┌────────┴─────────┐
            │                  │
            ▼                  ▼
    ┌──────────────┐    ┌──────────────┐
    │   M2 AI      │    │    M1 ML     │
    │ RAG + LLM +  │    │ Grounding    │
    │ Recovery     │    │ Verification │
    └──────────────┘    └──────────────┘
```

Supporting infrastructure:

```text
                    M3
                     │
        ┌────────────┴────────────┐
        ▼                         ▼
 PostgreSQL                    Redis
        │
        └── application data

                    M2
                     │
                     ▼
          Derived Knowledge Stores
        Qdrant (Dense) + Tantivy (BM25)
        + NetworkX (Topology Graph)
        [LanceDB = Offline Sandbox]

                    M4
                     │
                     ▼
          Docker / CI / Monitoring
```

The intended architecture in the blueprint is Next.js → Node.js → PostgreSQL/Redis/Python services, with Python handling RAG, agents, and ML.

---

# 2. WHO OWNS WHAT

This must never become ambiguous.

| Member | Owns                                                 | Does NOT own                    |
| ------ | ---------------------------------------------------- | ------------------------------- |
| M1     | Grounding ML                                         | RAG, backend, frontend          |
| M2     | Ingestion, retrieval, LLM, recovery                  | Node API, frontend, ML model    |
| M3     | Node API, DB, orchestration, persistence             | RAG internals, ML internals, UI |
| M4     | Next.js UI, Docker, CI/CD, monitoring, evaluation UI | Backend logic, RAG, ML          |

## M1

```text
Claim + Evidence
       ↓
Grounding Model
       ↓
Entailment / Contradiction / Neutral
       ↓
Grounding Score
```

## M2

```text
Documents
   ↓
Parse
   ↓
Chunk
   ↓
Embed
   ↓
Vector DB
   ↓
Retrieve
   ↓
Rerank
   ↓
LLM
   ↓
Claims
   ↓
Recovery when required
```

## M3

```text
Frontend request
       ↓
Validate
       ↓
Authenticate
       ↓
Create generation
       ↓
Call AI
       ↓
Coordinate ML
       ↓
Persist everything
       ↓
Return result / stream events
```

## M4

```text
User
 ↓
UI
 ↓
Node API
 ↓
Display:
Answer
Sources
Claims
Scores
Recovery
Metrics
```

The uploaded blueprint explicitly defines these four responsibilities and states that the goal is one integrated system rather than disconnected timelines.

---

# 3. REPOSITORY

Use **one monorepo**.

```text
grounding-guard/
│
├── apps/
│   ├── web/                     # M4
│   │   ├── app/
│   │   ├── components/
│   │   ├── lib/
│   │   └── types/
│   │
│   └── api/                     # M3
│       ├── src/
│       │   ├── modules/
│       │   │   ├── auth/
│       │   │   ├── projects/
│       │   │   ├── documents/
│       │   │   ├── conversations/
│       │   │   ├── generation/
│       │   │   └── metrics/
│       │   ├── routes/
│       │   ├── middleware/
│       │   └── config/
│       └── tests/
│
├── services/
│   ├── ai/                      # M2
│   │   ├── src/
│   │   │   ├── ingestion/
│   │   │   ├── chunking/
│   │   │   ├── embeddings/
│   │   │   ├── retrieval/
│   │   │   ├── generation/
│   │   │   └── agents/
│   │   └── tests/
│   │
│   └── ml/                      # M1
│       ├── src/
│       │   ├── inference/
│       │   ├── preprocessing/
│       │   └── contracts/
│       ├── training/
│       ├── evaluation/
│       ├── models/
│       └── tests/
│
├── packages/
│   ├── contracts/
│   ├── config/
│   └── types/
│
├── infra/
│   ├── docker/
│   ├── migrations/
│   └── monitoring/
│
├── datasets/
├── docs/
├── docker-compose.yml
├── package.json
└── README.md
```

This structure is the shared foundation specified by the project blueprint.

---

# 4. SERVICE ARCHITECTURE

For local development:

```text
web
localhost:3000

api
localhost:4000

ai
localhost:8000

ml
localhost:8001

postgres
localhost:5432

redis
localhost:6379
```

Inside Docker:

```text
web  → http://api:4000
api  → http://ai:8000
api  → http://ml:8001
api  → postgres:5432
api  → redis:6379
```

Important:

```text
Browser
   ↓
Node API ONLY
```

Never:

```text
Browser → ML
Browser → AI
Browser → PostgreSQL
Browser → Vector DB
```

The blueprint explicitly requires frontend → Node → Python AI/ML.

---

# 5. THE MOST IMPORTANT SHARED CONTRACT

Before anyone builds deeply, freeze these:

```text
requestId
projectId
documentId
chunkId
conversationId
generationId
claimId
modelVersion
```

Every generation must have:

```text
requestId
generationId
```

Every claim must have:

```text
claimId
generationId
```

Every evidence item must identify:

```text
chunkId
documentId
```

Every ML result must contain:

```text
modelVersion
```

---

# 6. SHARED CLAIM MODEL

This is the heart of the project.

Never think of an answer as simply:

```json
{
  "answer": "..."
}
```

Instead:

```text
Generation
   │
   ├── Claim 1
   │      ├── Evidence 1
   │      ├── Evidence 2
   │      └── Verification
   │
   ├── Claim 2
   │      ├── Evidence
   │      └── Verification
   │
   └── Claim 3
          ├── Evidence
          └── Verification
```

The blueprint specifically requires structured claim records rather than storing the answer only as one JSON blob.

Example:

```json
{
  "claimId": "claim_1",
  "text": "The company generated ₹50 Cr in 2024.",
  "status": "verified",
  "verification": {
    "label": "entailment",
    "groundingScore": 0.97,
    "modelVersion": "grounding-v1"
  },
  "evidence": [
    {
      "chunkId": "chunk_123",
      "documentId": "doc_123",
      "text": "Revenue was ₹50 Cr in 2024.",
      "metadata": {
        "page": 12
      }
    }
  ]
}
```

---

# 7. DATABASE

M3 owns the database.

But all four members use the same conceptual model.

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

Core entities:

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

These relationships are defined in the blueprint.

---

# 8. DOCUMENT INGESTION FLOW

This is where M2 starts.

User:

```text
Upload PDF
```

M4 sends:

```http
POST /v1/projects/{projectId}/documents
```

M3:

```text
1. Authenticate user
2. Validate project
3. Store document record
4. Store uploaded file
5. Create documentId
6. Tell M2 to ingest
```

M3 → M2:

```http
POST http://ai:8000/ingest
```

```json
{
  "documentId": "doc_123",
  "projectId": "project_123",
  "filePath": "/data/documents/file.pdf"
}
```

M2:

```text
PDF
 ↓
Parser
 ↓
Clean text
 ↓
Chunk
 ↓
Metadata
 ↓
Embeddings
 ↓
Vector DB
```

Example chunk:

```json
{
  "chunkId": "chunk_1",
  "documentId": "doc_123",
  "text": "Revenue was ₹50 Cr.",
  "metadata": {
    "page": 12,
    "source": "annual-report.pdf"
  }
}
```

M2 returns:

```json
{
  "documentId": "doc_123",
  "status": "completed",
  "chunksCreated": 42
}
```

M3 updates:

```text
Document.status = READY
```

M4 displays:

```text
Annual Report.pdf

Status: Ready
Chunks: 42
```

The ingestion pipeline and chunk contract are specified in the project source.

---

# 9. QUESTION / ANSWER FLOW

This is the most important flow.

User asks:

> What was the company's revenue in 2024?

---

## Step 1 — M4

Frontend sends:

```http
POST /v1/projects/project_123/generations
```

Body:

```json
{
  "query": "What was the company's revenue in 2024?",
  "conversationId": "conv_123",
  "options": {
    "stream": true,
    "maxRecoveryAttempts": 2
  }
}
```

---

# 10. M3 RECEIVES REQUEST

M3:

```text
Request
 ↓
Authenticate
 ↓
Check project access
 ↓
Validate body
 ↓
Create requestId
 ↓
Create generationId
 ↓
Create Generation record
 ↓
Call M2
```

Example:

```text
requestId = req_123
generationId = gen_123
```

---

# 11. M3 → M2

M3 calls:

```http
POST http://ai:8000/generate
```

Conceptually:

```json
{
  "requestId": "req_123",
  "generationId": "gen_123",
  "projectId": "project_123",
  "query": "What was the company's revenue in 2024?",
  "options": {
    "maxRecoveryAttempts": 2
  }
}
```

The exact final `/generate` response contract must be agreed by M2 + M3 together. The source explicitly warns against independently creating incompatible schemas.

---

# 12. M2 RETRIEVAL

M2 receives the question.

```text
Question
   ↓
Embedding
   ↓
Vector search
   ↓
Top K chunks
   ↓
Metadata filtering
   ↓
Reranking
   ↓
Context
```

Example:

```text
chunk_1
"The company generated ₹50 Cr in 2024."

chunk_8
"The company's revenue increased from..."
```

M2 creates an LLM context.

---

# 13. M2 LLM GENERATION

The LLM receives:

```text
QUESTION
+
RETRIEVED EVIDENCE
```

Example:

```text
Question:
What was the company's revenue in 2024?

Evidence:
Revenue was ₹50 Cr in 2024.
```

The LLM might incorrectly generate:

> The company generated ₹80 Cr in 2024.

This is intentional for the demo.

The project is specifically designed to detect that RAG evidence exists but the generated claim can still be wrong.

---

# 14. CLAIM PROCESSING

M2 now splits the answer into claims.

Example:

```text
Answer:

"The company generated ₹80 Cr in 2024.
Revenue increased significantly."
```

becomes:

```json
[
  {
    "claimId": "claim_1",
    "text": "The company generated ₹80 Cr in 2024."
  },
  {
    "claimId": "claim_2",
    "text": "Revenue increased significantly."
  }
]
```

Each claim must be verified separately.

---

# 15. M2 → M1

M2 sends the claim and evidence to M1.

```http
POST http://ml:8001/verify
```

Example:

```json
{
  "requestId": "req_123",
  "claimId": "claim_1",
  "claim": "The company generated ₹80 Cr in 2024.",
  "evidence": [
    {
      "chunkId": "chunk_1",
      "text": "The company generated ₹50 Cr in 2024."
    }
  ]
}
```

---

# 16. M1 VERIFICATION

M1:

```text
Evidence
   +
Claim
   ↓
Tokenizer
   ↓
DeBERTa / RoBERTa
   ↓
Classification
```

Returns:

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

The three labels are:

```text
entailment
contradiction
neutral
```

M1's responsibility is to determine support between claim and evidence, not to perform retrieval.

---

# 17. VERIFICATION DECISION

Now the system decides what to do.

```text
                    Claim
                      │
                      ▼
                 M1 Verify
                      │
          ┌───────────┼───────────┐
          ▼           ▼           ▼
      Entailment  Contradiction  Neutral
          │           │           │
          ▼           └─────┬─────┘
        PASS                ▼
                     Recovery needed
```

For MVP:

```text
entailment → accept
contradiction → recovery
neutral → recovery
```

The exact threshold for the grounding score belongs to M1 and must be based on validation/calibration rather than arbitrary guessing.

---

# 18. RECOVERY FLOW

This is M2's advanced responsibility.

If:

```text
label = contradiction
```

then:

```text
Failed Claim
     ↓
Recovery Agent
     ↓
Retrieve more evidence
     ↓
Rerank
     ↓
Inspect conflicting evidence
     ↓
Regenerate claim
     ↓
M1 verifies again
```

Example:

```text
Original:

"The company generated ₹80 Cr."

M1:

CONTRADICTION
```

Recovery:

```text
Retrieve evidence again
        ↓
Find:
"Revenue was ₹50 Cr."
        ↓
Regenerate
```

New claim:

```text
"The company generated ₹50 Cr in 2024."
```

Then:

```text
M2 → M1
```

M1:

```json
{
  "label": "entailment",
  "groundingScore": 0.97
}
```

Now:

```text
PASS
```

The source defines this exact recovery pattern: failed claim → diagnose → retrieve → regenerate → verify → pass/max retries.

---

# 19. MAX RECOVERY ATTEMPTS

Never allow infinite recovery.

Example:

```text
maxRecoveryAttempts = 2
```

Flow:

```text
Attempt 0
  ↓
Generate
  ↓
Verify
  ↓
FAIL
  ↓
Attempt 1
  ↓
Regenerate
  ↓
Verify
  ↓
FAIL
  ↓
Attempt 2
  ↓
Regenerate
  ↓
Verify
  ↓
PASS / FAIL
```

If still failed:

```text
status = needs_review
```

Do not keep looping.

---

# 20. FINAL RESULT

M2 returns a standardized result to M3.

Conceptually:

```json
{
  "requestId": "req_123",
  "generationId": "gen_123",
  "status": "completed",
  "answer": "The company generated ₹50 Cr in 2024.",
  "claims": [
    {
      "claimId": "claim_1",
      "text": "The company generated ₹50 Cr in 2024.",
      "status": "verified",
      "verification": {
        "label": "entailment",
        "groundingScore": 0.97,
        "modelVersion": "grounding-v1"
      },
      "evidence": [
        {
          "chunkId": "chunk_1",
          "documentId": "doc_123",
          "text": "Revenue was ₹50 Cr in 2024.",
          "metadata": {
            "page": 12
          }
        }
      ]
    }
  ]
}
```

---

# 21. M3 PERSISTENCE

M3 stores:

```text
Generation
Claim
Evidence
Verification
Recovery attempts
Latency
Model version
```

For example:

```text
Generation
 ├── query
 ├── finalAnswer
 ├── status
 ├── retrievalLatency
 ├── generationLatency
 ├── verificationLatency
 └── recoveryAttempts

Claim
 ├── text
 ├── status
 ├── label
 ├── groundingScore
 └── modelVersion

Evidence
 ├── chunkId
 ├── documentId
 ├── text
 └── metadata
```

This structured persistence is necessary so the frontend can later inspect every claim individually.

---

# 22. M3 → M4

M4 never needs to know how RAG or ML works.

It simply receives:

```text
Answer
Claims
Evidence
Verification
Recovery
Metrics
```

For example:

```text
Answer
────────────────────────

The company generated ₹50 Cr in 2024.

✓ Verified
Grounding: 0.97

Sources
────────────────────────

Annual Report
Page 12
```

The failed-claim experience:

```text
⚠ Claim flagged

Generated:
"The company generated ₹80 Cr."

Evidence:
"Revenue was ₹50 Cr."

Reason:
Contradiction

Recovery:
Completed

Final:
"The company generated ₹50 Cr."

✓ Re-verified
```

---

# 23. SSE STREAMING

For the MVP, M3 exposes SSE.

Endpoint:

```http
GET /v1/generations/{generationId}/events
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
```

The source explicitly proposes SSE and these generation events.

Frontend behavior:

```text
generation.started
       ↓
Show loading

token.delta
       ↓
Display answer progressively

sentence.verified
       ↓
Show ✓

sentence.flagged
       ↓
Show warning

recovery.started
       ↓
Show "Recovering..."

recovery.completed
       ↓
Replace/update claim

generation.completed
       ↓
Show final result
```

---

# 24. COMPLETE SYSTEM FLOW

This is the flow **everyone must understand**.

```text
                    USER
                      │
                      ▼
                NEXT.JS M4
                      │
                      │ POST generation
                      ▼
                NODE M3
                      │
                Validate/Auth
                      │
                Create IDs
                      │
                      ▼
                PYTHON M2
                      │
              ┌───────┴────────┐
              │                │
              ▼                ▼
          RETRIEVAL           LLM
              │                │
              └───────┬────────┘
                      ▼
                 CLAIMS
                      │
                      ▼
                PYTHON M1
                      │
               ┌──────┴──────┐
               │             │
             PASS           FAIL
               │             │
               │             ▼
               │         M2 RECOVERY
               │             │
               │        Retrieve again
               │             │
               │        Regenerate
               │             │
               │             ▼
               │           M1
               │             │
               │        PASS / FAIL
               │             │
               └──────┬──────┘
                      ▼
                RESULT BUILDER
                      │
                      ▼
                    M3
                      │
             ┌────────┴────────┐
             ▼                 ▼
        PostgreSQL             SSE
                                 │
                                 ▼
                                M4
                                 │
                                 ▼
                               USER
```

This is the single integrated pipeline.

---

# 25. PUBLIC NODE API

M3 owns the stable external API.

Base:

```text
/v1
```

### Auth

```text
POST /auth/register
POST /auth/login
POST /auth/logout
GET  /auth/me
```

### Projects

```text
POST   /projects
GET    /projects
GET    /projects/:projectId
PATCH  /projects/:projectId
DELETE /projects/:projectId
```

### Documents

```text
POST   /projects/:projectId/documents
GET    /projects/:projectId/documents
GET    /documents/:documentId
GET    /documents/:documentId/status
DELETE /documents/:documentId
```

### Conversations

```text
POST /projects/:projectId/conversations
GET  /projects/:projectId/conversations
GET  /conversations/:conversationId
GET  /conversations/:conversationId/messages
```

### Generation

```text
POST /projects/:projectId/generations
GET  /generations/:generationId
GET  /generations/:generationId/events
POST /generations/:generationId/cancel
```

### Grounding

```text
GET  /generations/:generationId/claims
GET  /claims/:claimId
GET  /claims/:claimId/evidence
POST /claims/:claimId/retry
```

### Evaluation

```text
GET  /projects/:projectId/metrics
GET  /projects/:projectId/evaluations
POST /projects/:projectId/evaluations
GET  /evaluations/:evaluationId
GET  /evaluations/:evaluationId/results
```

### Developer

```text
POST   /api-keys
GET    /api-keys
DELETE /api-keys/:keyId
```

These endpoints are the defined public contract in the source blueprint.

---

# 26. M2 INTERNAL API

M2 owns:

```text
POST /ingest
POST /retrieve
POST /generate
POST /recover
```

Example retrieval:

```json
{
  "projectId": "project_123",
  "query": "What was the revenue?",
  "topK": 5
}
```

Example response:

```json
{
  "results": [
    {
      "chunkId": "chunk_1",
      "documentId": "doc_123",
      "text": "Revenue was ₹50 Cr.",
      "score": 0.91,
      "metadata": {
        "page": 12
      }
    }
  ]
}
```

These internal endpoints and their purpose are defined in the source.

---

# 27. M1 INTERNAL API

M1 owns:

```text
POST /verify
POST /verify/batch
GET  /health
GET  /model/info
POST /evaluate
```

The most important:

```text
POST /verify
```

Input:

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

Output:

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

This is the core M1/M2 integration boundary.

---

# 28. M4 UI STRUCTURE

M4 should build these screens:

```text
/login
/signup

/dashboard

/projects/:id

/projects/:id/knowledge

/projects/:id/chat

/generations/:id

/projects/:id/evaluation

/developer
```

---

# 29. MAIN CHAT SCREEN

The user should see:

```text
┌─────────────────────────────────────────┐
│ GroundGuard                             │
├─────────────────────────────────────────┤
│                                         │
│ Question                                │
│ What was the company's revenue?         │
│                                         │
├─────────────────────────────────────────┤
│ Answer                                  │
│                                         │
│ The company generated ₹50 Cr.           │
│                                         │
│ ✓ Verified                              │
│ Grounding Score: 0.97                   │
│                                         │
├─────────────────────────────────────────┤
│ Sources                                 │
│                                         │
│ Annual Report                           │
│ Page 12                                 │
│                                         │
├─────────────────────────────────────────┤
│ Claims                                  │
│                                         │
│ ✓ Claim 1                               │
│   Entailment 0.97                       │
│                                         │
└─────────────────────────────────────────┘
```

---

# 30. FAILED CLAIM UI

If something fails:

```text
┌─────────────────────────────────────────┐
│ ⚠ Claim flagged                         │
├─────────────────────────────────────────┤
│                                         │
│ Generated                               │
│ "Revenue was ₹80 Cr."                   │
│                                         │
│ Evidence                                │
│ "Revenue was ₹50 Cr."                   │
│                                         │
│ Verification                            │
│ Contradiction                           │
│ Score: 0.01                             │
│                                         │
│ Recovery                                │
│ ● Retrieving evidence...                │
│ ● Regenerating...                       │
│ ● Re-verifying...                       │
│                                         │
└─────────────────────────────────────────┘
```

Then:

```text
✓ Recovered

"The company generated ₹50 Cr."

Entailment: 0.97
```

---

# 31. EVALUATION DASHBOARD

Eventually M4 should display:

```text
Grounding Rate
Contradiction Count
Verification Latency
Retrieval Latency
Generation Latency
Recovery Attempts
Model Version
Request Trace
```

These are specifically listed in the project blueprint.

---

# 32. DOCKER COMPOSE

One command should eventually start the whole MVP:

```bash
docker compose up --build
```

Services:

```yaml
services:

  web:
    ...

  api:
    ...

  ai:
    ...

  ml:
    ...

  postgres:
    ...

  redis:
    ...
```

M4 owns the final integrated Docker environment.

---

# 33. ENVIRONMENT VARIABLES

Example:

```text
# API
DATABASE_URL=
REDIS_URL=
AI_SERVICE_URL=http://ai:8000
ML_SERVICE_URL=http://ml:8001
JWT_SECRET=

# AI
VECTOR_DB_URL=
LLM_API_KEY=
EMBEDDING_MODEL=

# ML
MODEL_PATH=
MODEL_VERSION=grounding-v1

# Web
NEXT_PUBLIC_API_URL=http://localhost:4000
```

Never commit secrets.

Commit:

```text
.env.example
```

Never:

```text
.env
```

---

# 34. DEVELOPMENT STRATEGY

Do **not** wait until all four members finish before integrating.

Build vertical slices.

## Phase 1 — Foundation

All four agree on:

```text
Repo
Contracts
Database
Environment variables
IDs
Error schema
Grounding semantics
MVP acceptance criteria
```

Then:

```text
Docker
Postgres
Node
Next
Mock AI
Mock ML
```

must work.

---

# 35. PHASE 2 — FIRST E2E

Build:

```text
Upload PDF
   ↓
Mock/real ingestion
   ↓
Retrieve
   ↓
Generate
   ↓
Verify
   ↓
Display
```

Do not start with recovery.

First prove:

```text
Upload → RAG → LLM → ML → UI
```

---

# 36. PHASE 3 — REAL M2

Replace mock AI:

```text
Mock AI
   ↓
Real ingestion
Real embeddings
Real vector DB
Real retrieval
Real LLM
```

M3 stays the same.

M4 stays the same.

Only the internal implementation behind the M2 contract changes.

---

# 37. PHASE 4 — REAL M1

Replace mock verification:

```text
Mock ML
   ↓
Real ML service
```

Now:

```text
Claim
 ↓
Real cross-encoder
 ↓
Real grounding result
```

---

# 38. PHASE 5 — CLAIM-LEVEL VERIFICATION

Ensure:

```text
Every generated claim
        ↓
gets evidence
        ↓
gets M1 verification
        ↓
gets persisted
```

This is where the product's main differentiator becomes visible.

---

# 39. PHASE 6 — RECOVERY

After verification works:

```text
FAIL
 ↓
M2 recovery
 ↓
new evidence
 ↓
new claim
 ↓
M1 verification
```

Only then integrate agentic recovery.

The blueprint explicitly recommends starting with a single recovery agent and deterministic verification loop rather than a complex multi-agent architecture.

---

# 40. PHASE 7 — STREAMING

After the basic synchronous flow works:

```text
generation.started
 ↓
token.delta
 ↓
sentence.verified
 ↓
sentence.flagged
 ↓
recovery.started
 ↓
recovery.completed
 ↓
generation.completed
```

Then the UI feels like a real AI product.

---

# 41. PHASE 8 — PRODUCTIONIZATION

Finally:

```text
Docker
 ↓
CI
 ↓
Tests
 ↓
Health checks
 ↓
Logs
 ↓
Monitoring
 ↓
Deployment
```

The source's overall development sequence is foundation → first E2E → improve ML → improve RAG → recovery → productionization.

---

# 42. BRANCH STRATEGY

```text
main
│
├── member-1/ml
├── member-2/rag-agent
├── member-3/backend
└── member-4/frontend-devops
```

`main` must always represent the integrated system.

Never merge:

```text
"My module works locally"
```

without checking integration.

---

# 43. MOCK-FIRST DEVELOPMENT

This is extremely important.

Before M1 is finished, M3 should be able to test against:

```text
Mock ML
```

Before M2 is finished:

```text
Mock AI
```

Before M4 is finished:

```text
Mock Node API
```

Initial architecture:

```text
M4
 ↓
M3
 ↓
Mock M2
 ↓
Mock M1
```

Then gradually:

```text
M4
 ↓
M3
 ↓
Real M2
 ↓
Real M1
```

The blueprint explicitly recommends mocks so development can proceed before every component is finished.

---

# 44. ERROR HANDLING

Every request:

```text
requestId
```

Every error should conceptually contain:

```json
{
  "error": {
    "code": "GENERATION_FAILED",
    "message": "Generation service unavailable"
  },
  "requestId": "req_123"
}
```

This makes debugging across four services possible.

Example:

```text
Frontend error
      ↓
requestId=req_123
      ↓
Node logs
      ↓
AI logs
      ↓
ML logs
```

One request can therefore be traced across the entire architecture.

---

# 45. SECURITY BOUNDARIES

M3 owns:

```text
Authentication
Authorization
Project access
API keys
```

Every project-scoped request must verify:

```text
Does this user have access to this project?
```

M2 must also respect:

```text
projectId
```

when retrieving documents.

One project's documents must never appear in another project's retrieval results.

---

# 46. IMPORTANT DIFFERENCE: RETRIEVAL VS GROUNDING

Never confuse these.

### M2 asks:

> Is this evidence relevant to the question?

```text
Query
   ↕
Evidence
```

### M1 asks:

> Does this evidence actually support the generated claim?

```text
Claim
   ↕
Evidence
```

Therefore:

```text
Reranking ≠ Grounding verification
```

M2 handles relevance.

M1 handles factual support.

---

# 47. WHAT MVP ACTUALLY MEANS

Do not let the project become too large.

The minimum working product is:

```text
PDF
 ↓
Parsing
 ↓
Chunking
 ↓
Embeddings
 ↓
Retrieval
 ↓
LLM
 ↓
Claim segmentation
 ↓
ML grounding
 ↓
Evidence display
 ↓
Node API
 ↓
Next.js UI
 ↓
Docker
```

The source lists these as the MVP requirements.

Recovery, fine-tuning, streaming, reranking, SDK and evaluation dashboards can be layered on after the basic vertical slice works.

---

# 48. THE DEMO SCENARIO

Use one deterministic demo document.

For example:

```text
Annual Report.pdf
```

Contains:

```text
Revenue in 2024 was ₹50 Cr.
```

User asks:

```text
What was the company's revenue in 2024?
```

Force or simulate an initial bad generation:

```text
Revenue was ₹80 Cr.
```

M1:

```text
CONTRADICTION
```

Recovery:

```text
Retrieve evidence
 ↓
Regenerate
```

Final:

```text
Revenue was ₹50 Cr.
```

M1:

```text
ENTAILMENT
0.97
```

UI:

```text
Original claim
⚠ Contradiction

Recovery
✓ Corrected

Evidence
Annual Report — Page 12

Final answer
Revenue was ₹50 Cr.
```

This demonstrates the entire project's purpose in one flow. The source provides essentially this revenue example as the complete four-member integration scenario.

---

# 49. TESTING STRATEGY

Every layer needs tests.

## M1

```text
Model unit tests
Inference tests
Batch tests
Threshold tests
Evaluation tests
```

Test:

```text
Entailment
Contradiction
Neutral
Numerical changes
Negation
Dates
Entities
Unsupported additions
```

---

## M2

```text
Parser tests
Chunking tests
Embedding tests
Retrieval tests
Reranking tests
Generation tests
Recovery tests
```

---

## M3

```text
API tests
Auth tests
Authorization tests
Database tests
Integration tests
SSE tests
Error tests
```

---

## M4

```text
Component tests
Page tests
API integration tests
E2E tests
```

---

# 50. ONE CRITICAL E2E TEST

The entire team should have this test.

```text
Create user
 ↓
Create project
 ↓
Upload PDF
 ↓
Wait until READY
 ↓
Ask question
 ↓
Retrieve evidence
 ↓
Generate answer
 ↓
Extract claim
 ↓
Verify claim
 ↓
Persist result
 ↓
Display answer
 ↓
Display evidence
 ↓
Display verification
```

Then the recovery test:

```text
Generate incorrect claim
 ↓
M1 = contradiction
 ↓
M2 recovery
 ↓
New evidence
 ↓
New claim
 ↓
M1 = entailment
 ↓
Final answer
 ↓
UI shows recovery
```

If these two tests work, the four members are genuinely integrated.

---

# 51. ACCEPTANCE CRITERIA FOR MVP

The MVP is complete when:

### User

```text
✓ Can register/login
✓ Can create project
✓ Can upload PDF
✓ Can see ingestion status
✓ Can ask a question
✓ Can receive answer
✓ Can see sources
✓ Can inspect claims
✓ Can see grounding status
```

### M2

```text
✓ PDF ingestion works
✓ Chunking works
✓ Embeddings work
✓ Retrieval works
✓ LLM generation works
```

### M1

```text
✓ /verify works
✓ Entailment works
✓ Contradiction works
✓ Neutral works
✓ Model version returned
```

### M3

```text
✓ Public API works
✓ Authentication works
✓ Authorization works
✓ Database persists results
✓ AI/ML services communicate
✓ SSE works
```

### M4

```text
✓ Complete UI works
✓ Evidence panel works
✓ Claim view works
✓ Error/loading states work
✓ Docker Compose works
```

---

# 52. WHAT NOT TO BUILD YET

Do not let advanced features block the MVP.

Avoid initially:

```text
Multi-agent architecture
Multimodal documents
Complex adaptive retrieval
Token-level intervention
Constrained decoding
KV-cache optimization
Large-scale distributed inference
Complex SDK ecosystem
```

Those belong to the research/advanced stage.

The source explicitly separates MVP, Plus, and Research/Advanced capabilities.

---

# 53. FINAL OWNERSHIP MAP

```text
                    GROUNDGUARD
                         │
       ┌─────────────────┼─────────────────┐
       │                 │                 │
       ▼                 ▼                 ▼
      M4                M3                M2
    Product           Platform             AI
       │                 │                 │
       │                 │          ┌──────┴──────┐
       │                 │          │             │
       │                 │         RAG           LLM
       │                 │          │             │
       │                 │          └──────┬──────┘
       │                 │                 │
       │                 │              Claims
       │                 │                 │
       │                 │                 ▼
       │                 │                M1
       │                 │                 │
       │                 │             Grounding
       │                 │                 │
       │                 └─────────────────┘
       │
       ▼
     USER
```

More simply:

```text
M4 = what the user sees

M3 = what connects everything

M2 = where evidence and generation happen

M1 = where factual grounding is decided
```

---

# 54. THE SINGLE MOST IMPORTANT RULE

Never build four independent projects.

Build:

```text
ONE PROJECT
FOUR MODULES
ONE CONTRACT
ONE DATABASE
ONE USER FLOW
ONE DEPLOYMENT
```

The integration boundary is:

```text
M4
 ↓
M3
 ↓
M2
 ↓
M1
 ↓
M2
 ↓
M3
 ↓
M4
```

Not:

```text
M1 project
M2 project
M3 project
M4 project
```

---

# 55. FINAL PRODUCT FLOW

The complete GroundGuard MVP should feel like this:

```text
USER
 │
 │ Upload PDF
 ▼
M4 WEB
 │
 ▼
M3 API
 │
 ▼
M2 INGESTION
 │
 ├── Parse
 ├── Chunk
 ├── Embed
 └── Store
 │
 ▼
READY
 │
 │ Ask question
 ▼
M4 WEB
 │
 ▼
M3 API
 │
 ▼
M2 RAG
 │
 ├── Retrieve
 ├── Rerank
 └── Build context
 │
 ▼
LLM
 │
 ▼
Generated answer
 │
 ▼
Claim segmentation
 │
 ▼
M1 GROUNDING
 │
 ├── Entailment → PASS
 │
 ├── Neutral ──────┐
 │                 │
 └── Contradiction ┤
                   ▼
              M2 RECOVERY
                   │
             Retrieve again
                   │
               Regenerate
                   │
                   ▼
              M1 VERIFY
                   │
             PASS / MAX RETRY
                   │
                   ▼
              M3 PERSIST
                   │
          ┌────────┴────────┐
          ▼                 ▼
      PostgreSQL          SSE
                              │
                              ▼
                           M4 UI
                              │
                              ▼
                            USER
```

That is the **actual combined project**.

---

# 56. FINAL BUILD ORDER FOR THE TEAM

Follow this exact sequence.

```text
STEP 1
Create monorepo

        ↓

STEP 2
Freeze contracts

        ↓

STEP 3
Create database schema

        ↓

STEP 4
Create Docker Compose

        ↓

STEP 5
M3 creates Node skeleton

        ↓

STEP 6
M4 creates Next.js skeleton

        ↓

STEP 7
M2 creates mock AI service

        ↓

STEP 8
M1 creates mock ML service

        ↓

STEP 9
Connect:
M4 → M3 → Mock M2 → Mock M1

        ↓

STEP 10
Make first E2E test pass

        ↓

STEP 11
Replace Mock M2 with real RAG

        ↓

STEP 12
Replace Mock M1 with real grounding model

        ↓

STEP 13
Add claim-level persistence

        ↓

STEP 14
Add recovery

        ↓

STEP 15
Add SSE streaming

        ↓

STEP 16
Add evaluation metrics

        ↓

STEP 17
Add Docker health checks

        ↓

STEP 18
Add CI/CD

        ↓

STEP 19
Run complete E2E demo

        ↓

STEP 20
Freeze MVP
```

The project's source recommends essentially this vertical-slice approach and specifically says to integrate incrementally rather than having four disconnected development timelines.

---

# 57. THE FINAL MENTAL MODEL

If everyone forgets everything else, remember this:

```text
                    GROUNDGUARD

                 "Can I trust this answer?"

                         │
                         ▼

             ┌─────────────────────┐
             │      M2 — RAG       │
             │                     │
             │ Find the evidence   │
             └──────────┬──────────┘
                        │
                        ▼
             ┌─────────────────────┐
             │       LLM           │
             │                     │
             │ Generate answer     │
             └──────────┬──────────┘
                        │
                        ▼
             ┌─────────────────────┐
             │      M1 — ML        │
             │                     │
             │ Verify each claim   │
             └──────────┬──────────┘
                        │
                 ┌──────┴──────┐
                 │             │
                PASS          FAIL
                 │             │
                 │             ▼
                 │      ┌─────────────┐
                 │      │ M2 Recovery │
                 │      └──────┬──────┘
                 │             │
                 │             ▼
                 │          M1 Again
                 │             │
                 └──────┬──────┘
                        ▼
                ┌───────────────┐
                │ M3 Persistence │
                └───────┬───────┘
                        ▼
                ┌───────────────┐
                │ M4 Presentation│
                └───────┬───────┘
                        ▼
                       USER
```

**M2 finds.
LLM generates.
M1 verifies.
M2 recovers.
M3 orchestrates and stores.
M4 presents and deploys.**

That is the complete GroundGuard MVP architecture and the boundary between all four members.
