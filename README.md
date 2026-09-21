# GroundGuard

# GroundingGuard — Complete Project Blueprint

Bro, this is the master plan for all 4 members. The goal is to make sure everyone builds a different part of the same product, not four disconnected projects that we struggle to combine later.

![AI Observability monitoring & observability | Dynatrace Hub](https://images.openai.com/static-rsc-4/1_hup8DvjR8lebqi1Rvl0x5fl-IHDSGq0eded48GZkgRroRN5GVHA1yvJnNzHoXN1wvaHElrWzY89KWMmE8Ra-k014rH_Ws3mFxQztp8F20zaEbWu_DCltLTvsIneRNL55439CjNVPr2co2iny48gAkwcF9M29mv3TNv1jvMWsA?purpose=inline)

![Can ChatGPT work with your enterprise data? | by Mechanics Team | Medium](https://images.openai.com/static-rsc-4/HFk17HUxZk4s4rD5UAS8CvSpjxi1gmxpRQ0tozqbCxYbVXCtd8FsrmQApweY-NG_tpQGZhyGpgdCEwnEdXw10T8tPz9R-2o4VziZB6y6PtaKOfLi4Oh8qyVZ_TAdGWWPbJoaT6kkppmOE63F1480gw3NbUQ4oiF2B1678Xu3Nj0?purpose=inline)

![Performance Metrics | WhyLabs Documentation](https://images.openai.com/static-rsc-4/HuhALMwLfXkeMY6BD8kYC98rfj_HOYP-d5e09T_KrLVzlaCiWRohVq1Xk9OB39IKDpf2IvVEzBFCJeb_PAKpLN7Zw7KBYINhlTDYtOvSWeo2YzCbkwFq1M3k2mZosbamazj6rn2cuOdbUmOY86_BsyYdhen0yHlxU2sGSIeRTu8?purpose=inline)

6

# GroundingGuard

Evidence-grounded AI reliability platform

A platform that lets developers and users build or use RAG and agentic AI applications while verifying whether generated claims are supported by evidence.

RAG

Machine Learning

Agentic AI

Full Stack

Deployment

## 1. What exactly are we building?

A user uploads documents, asks questions, and receives an AI-generated answer.

Behind the scenes, GroundingGuard:

1. Retrieves relevant evidence.

2. Generates an answer using an LLM.

3. Splits the answer into sentences and claims.

4. Verifies those claims against the evidence using a trained ML model.

5. Identifies unsupported or contradictory claims.

6. Optionally invokes an agent to retrieve better evidence and repair the answer.

7. Shows the final answer with sources, grounding details, and system metrics.

### Core problem

> RAG retrieves information, but it does not guarantee that the LLM uses that information correctly.

We are building the verification and recovery layer that addresses this problem.

# 2. The technology stack

Frontend

Next.js + TypeScript + Tailwind + shadcn/ui

Backend

Node.js + TypeScript + Fastify/Express + PostgreSQL + Redis

RAG + Agentic AI

Python + FastAPI + LangGraph + LLM + pgvector/Qdrant

ML

Python + PyTorch + Hugging Face + DeBERTa/RoBERTa + ONNX Runtime

Deployment

Docker + GitHub Actions + cloud VM + monitoring

### Why Python for RAG, ML, and agents?

For this project, Python is a practical choice because the ML ecosystem, model fine-tuning, inference, embeddings, and evaluation all fit together naturally.

Keep Next.js + Node/TypeScript for the product and application backend.

The architecture becomes:

```
Next.js
   │
   ▼
Node.js / TypeScript API
   │
   ├── PostgreSQL
   ├── Redis
   └── Python AI Services
          ├── RAG
          ├── Agentic Recovery
          ├── ML Grounding
          └── Evaluation
```

# 3. The integrated architecture

This is the main context that every member must understand.

```
                           USER / DEVELOPER
                                  │
                                  ▼
                         ┌─────────────────┐
                         │   NEXT.JS WEB   │
                         │ Chat / Dashboard│
                         └────────┬────────┘
                                  │
                            REST + SSE
                                  │
                                  ▼
                         ┌─────────────────┐
                         │ NODE.JS API     │
                         │ Auth / Projects │
                         │ Orchestration   │
                         └────────┬────────┘
                                  │
             ┌────────────────────┼────────────────────┐
             │                    │                    │
             ▼                    ▼                    ▼
       PostgreSQL              Redis             Python AI
       Users/Projects          Cache             Services
       Documents/Logs          Jobs                    │
                                                       ▼
                                             ┌─────────────────┐
                                             │   RAG PIPELINE  │
                                             │ Ingest/Retrieve │
                                             │ Rerank/Context  │
                                             └────────┬────────┘
                                                      │
                                                      ▼
                                             ┌─────────────────┐
                                             │   LLM GENERATOR │
                                             │   Gemini / etc. │
                                             └────────┬────────┘
                                                      │
                                                 Generated Text
                                                      │
                                                      ▼
                                             ┌─────────────────┐
                                             │ CLAIM PROCESSOR  │
                                             │ Sentences/Claims│
                                             └────────┬────────┘
                                                      │
                                                      ▼
                                             ┌─────────────────┐
                                             │  ML GROUNDING   │
                                             │   CROSS-ENCODER │
                                             └────────┬────────┘
                                                      │
                                  ┌───────────────────┴───────────────────┐
                                  │                                       │
                                  ▼                                       ▼
                                PASS                                    FAIL
                                  │                                       │
                                  ▼                                       ▼
                           Final Response                         RECOVERY AGENT
                                  │                                       │
                                  │                                       ▼
                                  │                              More Retrieval
                                  │                                       │
                                  │                                       ▼
                                  │                               Regenerate Claim
                                  │                                       │
                                  │                                       ▼
                                  │                                  Verify Again
                                  │                                       │
                                  └───────────────────┬───────────────────┘
                                                      ▼
                                             ┌─────────────────┐
                                             │ RESULT BUILDER  │
                                             │ Claims/Sources  │
                                             │ Scores/Metrics  │
                                             └────────┬────────┘
                                                      │
                                                      ▼
                                             ┌─────────────────┐
                                             │ NODE.JS API     │
                                             └────────┬────────┘
                                                      │
                                                      ▼
                                             ┌─────────────────┐
                                             │ NEXT.JS UI      │
                                             │ Answer/Evidence │
                                             │ Metrics         │
                                             └─────────────────┘
```

This is the single source of truth for the entire team.


# 4. Repository structure — the shared foundation

Create one monorepo. All 4 members branch from this same structure.

```
grounding-guard/
│
├── apps/
│   ├── web/                         # Member 4
│   │   ├── app/
│   │   ├── components/
│   │   ├── lib/
│   │   └── types/
│   │
│   └── api/                         # Member 3
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
│   ├── ai/                          # Member 2
│   │   ├── src/
│   │   │   ├── rag/
│   │   │   ├── agents/
│   │   │   ├── generation/
│   │   │   └── contracts/
│   │   └── tests/
│   │
│   └── ml/                          # Member 1
│       ├── src/
│       │   ├── inference/
│       │   ├── preprocessing/
│       │   └── contracts/
│       ├── training/
│       ├── evaluation/
│       └── models/
│
├── packages/
│   ├── contracts/                   # Shared API schemas
│   ├── config/                      # Shared config
│   └── types/                       # Shared TS types
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

### Shared rules

* `main` contains the stable integrated system.

* Every member creates a feature branch.

* No one changes another member's module without coordination.

* Shared contracts are agreed upon before implementation.

* Every feature must include tests and update documentation.

* Merge small PRs frequently.

* Use mock services so development can happen before every component is finished.

# 5. Work division — detailed responsibilities

## Member 1 — ML / Grounding Model

Role: ML Research Engineer

### Objective

Build the actual model that decides whether a generated claim is supported by the evidence.

This is the scientific core of GroundingGuard.

### A. Dataset and preprocessing

Create training data with:

```
Evidence + Claim → Label
```

Labels:

* Entailment — evidence supports the claim.

* Contradiction — evidence conflicts with the claim.

* Neutral — evidence does not establish the claim.

Example:

JSON

```
{
  "evidence": "The company generated ₹50 Cr in 2024.",
  "claim": "The company generated ₹80 Cr in 2024.",
  "label": "contradiction"
}
```

Generate difficult examples:

* Numerical swaps.

* Negation.

* Entity swaps.

* Dates and years.

* Unsupported additions.

* Causal changes.

* Partial support.

### B. Train the model

Start with a pretrained NLI model, then fine-tune.

```
Evidence
    +
Claim
    │
    ▼
Tokenizer
    │
    ▼
DeBERTa / RoBERTa
    │
    ▼
Classification Head
    │
    ▼
Entailment / Contradiction / Neutral
```

Important: a pretrained NLI model is a baseline, not automatically a factuality detector. You need to evaluate how well it works on RAG-style claims.

### C. Grounding score

Create a consistent scoring rule.

For example:

```
groundingScore = entailment probability
```

But don't assume raw entailment probability is a calibrated factual confidence score. Evaluate calibration and define thresholds based on validation data.

### D. Inference service

Provide:

http

```
POST /verify
```

Input:

JSON

```
{
  "requestId": "req_123",
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

JSON

```
{
  "requestId": "req_123",
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

### E. Evaluation

Compare:

1. Cosine similarity baseline.

2. Bi-encoder baseline.

3. LLM-as-judge baseline.

4. Your fine-tuned cross-encoder.

Measure:

* Accuracy.

* Precision / recall / F1.

* Contradiction recall.

* False positives.

* Calibration.

* p50 / p95 inference latency.

Deliverable: A reproducible model, inference API, benchmark, and evaluation report.

## Member 2 — RAG + Agentic AI

Role: AI Systems Engineer

### Objective

Build the evidence pipeline and recovery system that supplies trustworthy context to the LLM.

### A. Document ingestion

Support:

* PDF.

* TXT.

* Markdown.

* URLs, later.

Pipeline:

```
Upload
  ↓
Parse
  ↓
Clean
  ↓
Chunk
  ↓
Metadata
  ↓
Embeddings
  ↓
Vector DB
```

Every chunk should contain:

JSON

```
{
  "chunkId": "chunk_1",
  "documentId": "doc_1",
  "text": "Revenue was ₹50 Cr.",
  "metadata": {
    "page": 12,
    "source": "annual-report.pdf"
  }
}
```

### B. Retrieval

Implement:

* Vector search.

* Metadata filtering.

* Top-K retrieval.

* Reranking.

* Context construction.

Later:

* Hybrid search.

* Query rewriting.

* Retrieval evaluation.

### C. LLM generation

Build a service that receives:

JSON

```
{
  "query": "What was the revenue?",
  "context": [
    {
      "chunkId": "chunk_1",
      "text": "Revenue was ₹50 Cr."
    }
  ]
}
```

Returns generated text plus references to the evidence used.

### D. Agentic recovery

Build a recovery graph:

```
Generated claim
      ↓
Verification result
      ↓
     FAIL
      ↓
Diagnose failure
      ↓
Retrieve more evidence
      ↓
Regenerate claim
      ↓
Verify again
      ↓
PASS / MAX RETRIES
```

Use LangGraph or a simple explicit state machine.

Do not start with a multi-agent system. Start with one recovery agent and one deterministic verification loop.

### E. Agent tools

Potential tools:

* Search knowledge base.

* Fetch document chunks.

* Rerank evidence.

* Regenerate a claim.

* Compare conflicting evidence.

### Deliverable

A Python AI service that can:

1. Ingest documents.

2. Retrieve evidence.

3. Generate grounded answers.

4. Recover from failed claims.

5. Return standardized results to the Node backend.

## Member 3 — Backend + Platform Integration

Role: Backend / Platform Engineer

### Objective

Build the central API that connects frontend, RAG, ML, storage, and observability.

### A. API server

Node.js + TypeScript.

Recommended:

* Fastify or Express.

* Zod.

* PostgreSQL.

* Prisma or Drizzle.

* Redis when jobs/caching become necessary.

### B. Authentication and projects

Manage:

* Users.

* Projects.

* API keys.

* Documents.

* Conversations.

* Requests.

* Results.

### C. Orchestration

The backend should coordinate:

```
Frontend request
      ↓
Validate
      ↓
Create request record
      ↓
Call Python AI service
      ↓
Receive events/results
      ↓
Persist result
      ↓
Return to frontend
```

### D. Streaming

Use SSE for the MVP:

```
POST /v1/generations
```

Could return:

```
event: generation.started

event: token.delta

event: sentence.verified

event: sentence.flagged

event: generation.completed
```

### E. Integration contracts

Member 3 owns the stable external API. Members 1 and 2 own their internal Python service contracts.

### Deliverable

A backend that supports authentication, project management, document references, generation requests, streaming, persistence, and ML/RAG service integration.

## Member 4 — Frontend + DevOps + Evaluation UI

Role: Product Engineer / DevOps

### Objective

Build the user-facing application and make the complete system easy to run, test, and demonstrate.

### A. Frontend pages

1. Login / signup.

2. Project dashboard.

3. Project knowledge base.

4. Document upload.

5. AI chat / research workspace.

6. Grounding evidence panel.

7. Claim-level verification view.

8. Evaluation dashboard.

9. Developer API / integration page.

### B. Core chat experience

User asks a question.

Frontend displays:

```
Answer
────────────────────────
Revenue was ₹50 Cr. ✓

Sources
────────────────────────
Annual Report — Page 12

Grounding
────────────────────────
Entailment: 0.96
Contradiction: 0.02
Neutral: 0.02
```

If a claim fails:

```
⚠ Claim flagged

Reason: Contradiction

Evidence:
Revenue was ₹50 Cr.

Generated:
Revenue was ₹80 Cr.

Recovery: In progress...
```

### C. DevOps

* Dockerize frontend, backend, AI, and ML services.

* Setup CI/CD.

* Environment variables.

* Health checks.

* Logs.

* Basic monitoring.

* Deploy the MVP.

* Document local setup.

### D. Evaluation dashboard

Show:

* Grounding rate.

* Contradiction count.

* Verification latency.

* Retrieval latency.

* Generation latency.

* Recovery attempts.

* Model version.

* Request trace.

### Deliverable

A polished Next.js application, Docker setup, CI/CD, monitoring, and end-to-end demo.

# 6. The actual end-to-end API contract

This is the most important integration section.

Every member should build against these contracts.

## Base URLs

```
Frontend:
http://localhost:3000

Node API:
http://localhost:4000

Python AI:
http://localhost:8000

Python ML:
http://localhost:8001

PostgreSQL:
localhost:5432

Redis:
localhost:6379
```

The frontend should only call Node API.

Frontend → Node → Python AI/ML

Never make the frontend directly call the ML service.


# 7. Required endpoints — complete MVP contract

These are the endpoints we should agree on before coding. The exact framework doesn't matter; the request and response contracts do.

## A. Node.js API — public application endpoints

Base path: `/v1`

### 1. Authentication

|
Method

|

Endpoint

|

Purpose

|
| --- | --- | --- |
|

POST

|

`/auth/register`

|

Create user

|
|

POST

|

`/auth/login`

|

Login

|
|

POST

|

`/auth/logout`

|

Logout

|
|

GET

|

`/auth/me`

|

Current user

|

### 2. Projects

|
Method

|

Endpoint

|

Purpose

|
| --- | --- | --- |
|

POST

|

`/projects`

|

Create project

|
|

GET

|

`/projects`

|

List projects

|
|

GET

|

`/projects/:projectId`

|

Project details

|
|

PATCH

|

`/projects/:projectId`

|

Update project

|
|

DELETE

|

`/projects/:projectId`

|

Delete project

|

### 3. Documents

|
Method

|

Endpoint

|

Purpose

|
| --- | --- | --- |
|

POST

|

`/projects/:projectId/documents`

|

Upload document

|
|

GET

|

`/projects/:projectId/documents`

|

List documents

|
|

GET

|

`/documents/:documentId`

|

Document details

|
|

GET

|

`/documents/:documentId/status`

|

Ingestion status

|
|

DELETE

|

`/documents/:documentId`

|

Delete document

|

### 4. Conversations

|
Method

|

Endpoint

|

Purpose

|
| --- | --- | --- |
|

POST

|

`/projects/:projectId/conversations`

|

Create conversation

|
|

GET

|

`/projects/:projectId/conversations`

|

List conversations

|
|

GET

|

`/conversations/:conversationId`

|

Conversation details

|
|

GET

|

`/conversations/:conversationId/messages`

|

Messages

|

### 5. Generation

|
Method

|

Endpoint

|

Purpose

|
| --- | --- | --- |
|

POST

|

`/projects/:projectId/generations`

|

Generate answer

|
|

GET

|

`/generations/:generationId`

|

Generation details

|
|

GET

|

`/generations/:generationId/events`

|

SSE stream

|
|

POST

|

`/generations/:generationId/cancel`

|

Cancel generation

|

### 6. Grounding / claims

|
Method

|

Endpoint

|

Purpose

|
| --- | --- | --- |
|

GET

|

`/generations/:generationId/claims`

|

All claims

|
|

GET

|

`/claims/:claimId`

|

Claim details

|
|

GET

|

`/claims/:claimId/evidence`

|

Supporting evidence

|
|

POST

|

`/claims/:claimId/retry`

|

Retry a failed claim

|

### 7. Evaluation

|
Method

|

Endpoint

|

Purpose

|
| --- | --- | --- |
|

GET

|

`/projects/:projectId/metrics`

|

Project metrics

|
|

GET

|

`/projects/:projectId/evaluations`

|

Evaluation runs

|
|

POST

|

`/projects/:projectId/evaluations`

|

Start evaluation

|
|

GET

|

`/evaluations/:evaluationId`

|

Evaluation status

|
|

GET

|

`/evaluations/:evaluationId/results`

|

Evaluation results

|

### 8. Developer API

|
Method

|

Endpoint

|

Purpose

|
| --- | --- | --- |
|

POST

|

`/api-keys`

|

Create API key

|
|

GET

|

`/api-keys`

|

List API keys

|
|

DELETE

|

`/api-keys/:keyId`

|

Revoke API key

|

# 8. Python AI service endpoints

Member 2 owns these.

Base: `http://localhost:8000`

### Documents / RAG

http

```
POST /ingest
```

Input:

JSON

```
{
  "documentId": "doc_123",
  "projectId": "project_123",
  "filePath": "/data/documents/file.pdf"
}
```

Output:

JSON

```
{
  "documentId": "doc_123",
  "status": "completed",
  "chunksCreated": 42
}
```

http

```
POST /retrieve
```

Input:

JSON

```
{
  "projectId": "project_123",
  "query": "What was the revenue?",
  "topK": 5
}
```

Output:

JSON

```
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

### Generation

http

```
POST /generate
```

Input:

JSON

```
{
  "requestId": "req_123",
  "projectId": "project_123",
  "query": "What was the revenue?",
  "options": {
    "stream": true,
    "maxRecoveryAttempts": 2
  }
}
```

Output:

JSON

```
{
  "requestId": "req_123",
  "status": "completed",
  "answer": "Revenue was ₹50 Cr.",
  "claims": [],
  "sources": []
}
```

### Recovery

http

```
POST /recover
```

Input:

JSON

```
{
  "requestId": "req_123",
  "claimId": "claim_1",
  "claim": "Revenue was ₹80 Cr.",
  "evidence": [],
  "failureReason": "contradiction"
}
```

Output:

JSON

```
{
  "status": "completed",
  "replacementClaim": "Revenue was ₹50 Cr.",
  "evidence": [],
  "recoveryAttempts": 1
}
```

Important: The final schema for `/generate` should be decided by Member 2 and Member 3 together. Don't build two incompatible response formats.

# 9. Python ML service endpoints

Member 1 owns these.

Base: `http://localhost:8001`

### Verify a claim

http

```
POST /verify
```

Input:

JSON

```
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

JSON

```
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

### Batch verification

http

```
POST /verify/batch
```

Useful for verifying multiple claims efficiently.

### Model information

http

```
GET /health
GET /model/info
```

### Evaluation

http

```
POST /evaluate
```

This can run benchmark evaluation and return accuracy, F1, contradiction recall, and latency.

# 10. One complete example — how all 4 connect

User asks:

> "What was the company's revenue in 2024?"

### Step 1 — Frontend

http

```
POST /v1/projects/project_123/generations
```

### Step 2 — Node backend

* Validates request.

* Creates `generationId`.

* Calls Python AI.

### Step 3 — RAG service

```
Query
  ↓
Retrieve chunks
  ↓
Rerank
  ↓
Build context
```

Returns:

```
Revenue was ₹50 Cr.
```

### Step 4 — LLM

Generates:

> "The company generated ₹80 Cr in 2024."

### Step 5 — Claim processor

Extracts:

JSON

```
{
  "claimId": "claim_1",
  "text": "The company generated ₹80 Cr in 2024."
}
```

### Step 6 — ML

http

```
POST http://ml:8001/verify
```

Returns:

JSON

```
{
  "label": "contradiction",
  "groundingScore": 0.01
}
```

### Step 7 — Agent

Recovery agent retrieves the evidence again and regenerates:

> "The company generated ₹50 Cr in 2024."

### Step 8 — ML verifies again

JSON

```
{
  "label": "entailment",
  "groundingScore": 0.97
}
```

### Step 9 — Backend

Persists:

* Final answer.

* Claims.

* Evidence.

* Scores.

* Latencies.

* Recovery attempts.

### Step 10 — Frontend

Displays the answer, source references, and verification details.

# 11. Database — shared data model

Member 3 owns the database, but everyone must agree on the model.

```
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

### Core entities

|
Entity

|

Main purpose

|
| --- | --- |
|

User

|

Authentication

|
|

Project

|

Workspace and configuration

|
|

Document

|

Uploaded knowledge

|
|

Chunk

|

Searchable document segment

|
|

Conversation

|

User session

|
|

Message

|

User / assistant message

|
|

Generation

|

One AI request

|
|

Claim

|

Sentence or factual claim

|
|

Evidence

|

Source supporting a claim

|
|

Evaluation

|

Benchmark run

|
|

APIKey

|

Developer access

|

### Important design decision

Do not store the whole answer as only one JSON blob.

You need structured claim records so the frontend can show:

```
Claim 1 → Evidence → Score
Claim 2 → Evidence → Score
Claim 3 → Evidence → Score
```

# 12. User flow — what the product should feel like

## A. Create project

```
Login
  ↓
Dashboard
  ↓
Create project
  ↓
Project workspace
```

## B. Add knowledge

```
Upload PDF
  ↓
Processing
  ↓
Chunking
  ↓
Embedding
  ↓
Ready
```

User sees:

```
Annual Report.pdf
Status: Ready
Chunks: 42
```

## C. Ask question

```
Open chat
  ↓
Ask question
  ↓
Retrieve knowledge
  ↓
Generate
  ↓
Verify
  ↓
Answer
```

## D. Inspect grounding

User can expand each claim:

```
Claim
"The company generated ₹50 Cr."

Evidence
Annual Report — Page 12

Status
Entailed

Model score
0.97
```

## E. Failed claim

```
Claim flagged
      ↓
Show evidence
      ↓
Recovery in progress
      ↓
Updated answer
      ↓
Verify
```

## F. Developer usage

A developer can eventually:

```
Create project
  ↓
Upload knowledge
  ↓
Create API key
  ↓
Call GroundingGuard API
  ↓
Receive verified answer
```

# 13. MVP vs Plus vs Research

## MVP

Must build

* PDF ingestion and chunking.

* Embeddings + retrieval.

* LLM answer generation.

* Sentence/claim segmentation.

* ML grounding baseline.

* Evidence display.

* Node API + Next.js UI.

* Dockerized local system.

## Plus

Differentiator

* Fine-tuned cross-encoder.

* Streaming sentence verification.

* Recovery agent.

* Hybrid retrieval + reranking.

* Recommendation verification.

* Developer SDK.

* Evaluation dashboard.

## Research / Advanced

Later

* KV-cache reuse.

* Token-level intervention.

* Constrained decoding.

* Adaptive retrieval.

* Multimodal grounding.

* High-performance inference.

Most important turning point: Streaming verification + automatic recovery.

That is where the project moves from detecting hallucinations after the answer to actively trying to prevent unsupported output from reaching the user.

# 14. Development order

Don't divide the project into four separate timelines that never meet.

Build in vertical slices.

1. Foundation

   Shared repo, contracts, database schema, Docker, mock AI service, basic Next.js and Node API.

2. First end-to-end MVP

   Upload document → retrieve → generate → verify → display result.

3. Improve ML

   Train model, benchmark baselines, integrate actual inference.

4. Improve RAG

   Reranking, metadata filters, better context construction, retrieval evaluation.

5. Add recovery

   Agentic retry and claim regeneration.

6. Productionize

   Streaming, deployment, monitoring, SDK, testing, evaluation dashboard.

# 15. Integration strategy — how to avoid chaos

### Branch structure

```
main
│
├── member-1/ml
├── member-2/rag-agent
├── member-3/backend
└── member-4/frontend-devops
```

### Before starting

All 4 agree on:

* Repository structure.

* Database schema.

* API contracts.

* Shared types.

* Environment variables.

* Request IDs.

* Error format.

* Definition of grounding score.

* MVP acceptance criteria.

### During development

Each member builds their service independently.

But they also build a mock contract:

```
Frontend
   ↓
Node API
   ↓
Mock AI
   ↓
Mock ML
   ↓
Frontend result
```

Then replace mocks with real services one at a time.

### Pull request rule

Every PR should contain:

```
What changed?
Which contract changed?
What does it depend on?
How to run it?
How to test it?
```

### Integration order

```
1. Backend + Frontend skeleton
2. Backend + RAG mock
3. Backend + ML mock
4. Real RAG
5. Real ML
6. Claim-level verification
7. Agent recovery
8. Streaming
9. Deployment
```

# 16. What the finished project should produce

At the end, you should have one integrated product with:

### User application

* Knowledge-base upload.

* AI chat.

* Grounding evidence.

* Claim-level verification.

* Recovery status.

* Recommendation demo.

### Developer platform

* REST API.

* API keys.

* SDK.

* Integration docs.

* Project configuration.

### ML research

* Trained cross-encoder.

* Synthetic and real evaluation data.

* Baseline comparison.

* Accuracy and latency report.

* Model versioning.

### AI engineering

* RAG pipeline.

* Retrieval evaluation.

* Agentic recovery.

* Evidence attribution.

* Streaming generation.

### Deployment

* Docker Compose.

* CI/CD.

* Cloud deployment.

* Metrics.

* Logs.

* Health checks.

## Final context for all 4 members

## The project identity

We are building an AI reliability platform.

Member 1 makes the model that detects grounding failures.

Member 2 supplies evidence and handles recovery.

Member 3 connects everything through the backend and data layer.

Member 4 makes the product usable, observable, and deployable.

All 4 are building one system: RAG + LLM + Grounding ML + Agentic Recovery + Developer Platform.

The next practical step is to freeze the shared contract document and create the repository skeleton before any member starts implementing their individual feature. That will be the foundation from which all 4 branches can safely grow.
