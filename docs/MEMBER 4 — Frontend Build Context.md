## MEMBER 4 — COMPLETE BUILD CONTEXT

### GroundGuard — Frontend + DevOps + Evaluation UI

This is the **isolated build context for Member 4 only**.

Your job is to turn the backend + AI system into a polished, usable product and make the complete system runnable, observable, and demo-ready.

The project blueprint assigns M4 responsibility for **Next.js UI, the chat/research workspace, grounding/evidence visualization, evaluation dashboard, Dockerization, CI/CD, environment configuration, health checks, monitoring, deployment, and local setup documentation**. 

---

# 1. Your role

You are:

> **Member 4 — Frontend + DevOps + Evaluation UI Engineer**

Your work sits at the outside of the system:

```text
                         GROUNDGUARD

                    ┌─────────────────┐
                    │    FRONTEND     │
                    │       M4        │
                    └────────┬────────┘
                             │
                        REST + SSE
                             │
                             ▼
                    ┌─────────────────┐
                    │    NODE API     │
                    │       M3        │
                    └────────┬────────┘
                             │
                    ┌────────┴────────┐
                    ▼                 ▼
                  M2 AI             M1 ML
```

You make this system understandable and usable.

---

# 2. Your ownership

## You OWN

```text
Next.js
TypeScript frontend
Tailwind
shadcn/ui
Authentication screens
Project dashboard
Knowledge base
Document upload UI
AI chat/research workspace
Answer display
Source display
Grounding visualization
Claim-level verification UI
Recovery status UI
Evaluation dashboard
Developer/API page
Docker
Docker Compose integration
CI/CD
Environment configuration
Health checks
Logs/monitoring basics
Deployment
E2E frontend tests
Local setup documentation
```

---

# 3. You DO NOT OWN

Do not build:

```text
❌ ML model
❌ ML inference service
❌ RAG retrieval
❌ embeddings
❌ vector DB
❌ LLM generation
❌ LangGraph agent
❌ Node backend
❌ PostgreSQL application logic
❌ Authentication backend
❌ AI service APIs
```

You consume M3's public API.

---

# 4. Golden architecture rule

The frontend **only talks to Node API**.

Never:

```text id="tjqh8m"
Next.js
   ├──→ Node
   ├──→ M2
   └──→ M1
```

Correct:

```text id="zh3p4e"
Next.js
   ↓
Node API
   ↓
M2
   ↓
M1
```

The project blueprint explicitly establishes this boundary. 

---

# 5. Frontend technology

Use:

```text id="6k9qwb"
Next.js
TypeScript
Tailwind CSS
shadcn/ui
```

Recommended supporting tools:

```text id="9jbrs6"
React Query / TanStack Query
Zod
React Hook Form
```

Choose only what is actually useful.

Don't overload the frontend with unnecessary libraries.

---

# 6. Your directory

Recommended:

```text id="vqlz4a"
apps/web/
│
├── app/
│   ├── login/
│   ├── signup/
│   ├── dashboard/
│   ├── projects/
│   │   └── [projectId]/
│   │       ├── page.tsx
│   │       ├── knowledge/
│   │       ├── chat/
│   │       ├── evaluations/
│   │       └── developer/
│   │
│   ├── settings/
│   └── layout.tsx
│
├── components/
│   ├── layout/
│   ├── projects/
│   ├── documents/
│   ├── chat/
│   ├── grounding/
│   ├── evaluations/
│   └── developer/
│
├── lib/
│   ├── api.ts
│   ├── auth.ts
│   ├── sse.ts
│   └── utils.ts
│
├── hooks/
│   ├── useProjects.ts
│   ├── useDocuments.ts
│   ├── useGeneration.ts
│   └── useEvaluation.ts
│
├── types/
│   └── api.ts
│
├── public/
│
├── Dockerfile
├── package.json
└── README.md
```

You can organize components differently, but maintain clear separation between API logic and UI.

---

# 7. Main pages

The blueprint calls for these major UI areas:

```text id="1tukc4"
Login / Signup
Project Dashboard
Knowledge Base
Document Upload
AI Chat / Research Workspace
Grounding Evidence Panel
Claim-level Verification
Evaluation Dashboard
Developer API / Integration
```



---

# 8. Page 1 — Login

Route:

```text
/login
```

Include:

```text id="wzsl4w"
Email
Password
Login
Link → Signup
Error state
Loading state
```

Frontend calls:

```http
POST /v1/auth/login
```

Never call the database directly.

---

# 9. Page 2 — Signup

Route:

```text
/signup
```

Include:

```text id="y4p5wo"
Email
Password
Confirm password
Create account
```

Call:

```http
POST /v1/auth/register
```

After successful registration:

```text
→ dashboard
```

---

# 10. Page 3 — Dashboard

Route:

```text
/dashboard
```

Show:

```text id="ec8zkw"
Projects
Recent conversations
Recent generations
Basic system/product information
```

Primary action:

```text
Create Project
```

---

# 11. Page 4 — Project dashboard

Route:

```text
/projects/:projectId
```

This becomes the central workspace.

Suggested navigation:

```text id="mgn3lf"
Overview
Knowledge Base
Chat
Evaluations
Developer
Settings
```

---

# 12. Project overview

Show:

```text id="8cq2ly"
Project name
Description

Documents
Conversations
Generations

Grounding rate
Contradiction count
Average latency
Recovery attempts
```

The exact metrics come from M3's metrics API.

Don't calculate ML metrics yourself unless the API explicitly provides the required raw data.

---

# 13. Knowledge Base

Route:

```text
/projects/:projectId/knowledge
```

This page handles documents.

Show:

```text id="1ek1rt"
Upload document
Document list
Filename
Type
Status
Upload date
Processing status
```

---

# 14. Upload flow

User:

```text id="wz52kp"
Select PDF
      ↓
Upload
      ↓
Document appears
      ↓
Status = processing
      ↓
Status = completed
```

Call M3:

```http
POST /v1/projects/:projectId/documents
```

Then poll or use an appropriate status mechanism:

```http
GET /v1/documents/:documentId/status
```

---

# 15. Document states

Represent states clearly:

```text id="cl7r9y"
uploaded
processing
completed
failed
```

Possible UI:

```text
Document.pdf
Processing...
```

then:

```text
Document.pdf
Ready
```

or:

```text
Document.pdf
Processing failed
[Retry]
```

---

# 16. Don't show technical internals

Do not expose:

```text id="6gc30c"
FastAPI
LangGraph
Qdrant / Tantivy
DeBERTa
Docker
Redis
```

inside normal user-facing document status.

The user cares about:

```text
Processing
Ready
Failed
```

Technical details belong in developer/admin-oriented areas.

---

# 17. Main product feature — Chat

Route:

```text
/projects/:projectId/chat
```

This should be the strongest part of the frontend.

Layout:

```text id="0o7s9v"
┌──────────────────────────────────────────────┐
│ GroundGuard                                  │
├──────────────────────────────────────────────┤
│                                              │
│ User question                                │
│                                              │
│ AI answer                                    │
│                                              │
│ Claim verification                           │
│                                              │
│ Sources / Evidence                            │
│                                              │
├──────────────────────────────────────────────┤
│ Ask a question...                     Send   │
└──────────────────────────────────────────────┘
```

---

# 18. Chat request

Call:

```http
POST /v1/projects/:projectId/generations
```

M3 handles the actual AI workflow.

Frontend should not know how retrieval or verification happens.

---

# 19. Streaming

The chat should support SSE.

Connect to:

```http
GET /v1/generations/:generationId/events
```

The blueprint defines generation SSE events such as:

```text
generation.started
token.delta
sentence.verified
sentence.flagged
generation.completed
```



---

# 20. Streaming UI

Instead of waiting for everything:

```text id="u9s1qw"
Generating...
```

show:

```text id="f9ty6k"
The company generated ₹50 Cr...
```

as tokens arrive.

Then progressively update verification.

Example:

```text
The company generated ₹50 Cr. ✓
It operates in India and Singapore. ✓
Revenue increased by 40%. ⚠
```

---

# 21. Answer structure

Every final answer should ideally have:

```text id="gk70vi"
Answer
↓
Claims
↓
Verification
↓
Evidence
```

Don't make the user hunt through raw JSON.

---

# 22. Claim-level verification

This is one of the most important UI features.

Example:

> The company generated ₹50 Cr in 2024.

Show:

```text
✓ Grounded
Grounding score: 0.97
```

Another:

> Revenue was ₹80 Cr.

Show:

```text
⚠ Contradicted
```

Then allow the user to expand it.

---

# 23. Claim detail panel

When a claim is clicked:

```text id="x4bj7n"
CLAIM

Revenue was ₹80 Cr.

VERIFICATION

Contradiction

EVIDENCE

Annual Report
Page 12

"Revenue was ₹50 Cr."

RECOVERY

Attempt 1
Recovered

Replacement:
Revenue was ₹50 Cr.
```

The exact wording should come from API data.

---

# 24. Grounding status

Use clear states:

```text id="7xw0qg"
Entailed
Contradiction
Neutral
Pending
Recovering
Recovered
Failed
```

Don't invent additional ML semantics.

M1 owns the meaning of its labels.

---

# 25. Grounding score

If M3 returns:

```json id="z3b8dg"
{
  "groundingScore": 0.97
}
```

you can display:

```text
Grounding score: 97%
```

But make clear that this is a **model score**, not a guarantee of factual truth.

The M1 design specifically distinguishes model scores from calibrated factual confidence. 

---

# 26. Evidence panel

For each claim show:

```text id="2l6svq"
Source
Document name

Page
12

Evidence
Revenue was ₹50 Cr.

Retrieval relevance
0.91
```

If page/source metadata exists, expose it.

---

# 27. Evidence interaction

Good interaction:

```text
Claim
  ↓ click
Evidence panel opens
  ↓
Document
  ↓
Page/source information
```

Eventually this could support:

```text
Open document
Jump to page
```

if document-viewing infrastructure exists.

Do not implement a complex PDF viewer unless the project actually needs it.

---

# 28. Recovery visualization

When a claim fails:

```text
⚠ Claim flagged
   ↓
Searching for stronger evidence...
   ↓
Regenerating...
   ↓
✓ Claim recovered
```

This visually communicates the project's unique feature.

---

# 29. Don't hide recovery

GroundGuard's recovery system is a key differentiator.

The user should be able to understand:

```text
Original claim
↓
Why it failed
↓
Recovery attempt
↓
Replacement claim
↓
Verification result
```

---

# 30. Failed recovery

If recovery cannot fix a claim:

```text
⚠ Unable to verify claim
```

Then show:

```text
Recovery attempts: 2
Reason: insufficient evidence
```

Do not show an unsupported claim as confidently verified.

---

# 31. Sources section

At the end of an answer:

```text
Sources

1. Annual Report 2024
   Page 12

2. Financial Statement
   Page 8
```

Clicking a source should expose relevant evidence if available.

---

# 32. Conversation history

The project should retain conversations.

Show:

```text id="2v4gg9"
Recent conversations
--------------------
Revenue analysis
Annual report summary
Company expansion
Financial results
```

Click:

```text
→ /projects/:projectId/chat?conversation=...
```

or equivalent route structure.

---

# 33. Evaluation dashboard

Route:

```text
/projects/:projectId/evaluations
```

This is your second major feature after chat.

The blueprint specifically calls for an evaluation dashboard showing:

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



---

# 34. Evaluation dashboard layout

Suggested:

```text id="c4cw7e"
┌─────────────────────────────────────────┐
│ Evaluation Dashboard                    │
├─────────────┬─────────────┬─────────────┤
│ Grounding   │ Contradict. │ Recovery    │
│ Rate        │ Count       │ Attempts    │
├─────────────┴─────────────┴─────────────┤
│ Latency                                   │
│ Retrieval | Generation | Verification    │
├─────────────────────────────────────────┤
│ Model Version                            │
├─────────────────────────────────────────┤
│ Recent Evaluations                       │
└─────────────────────────────────────────┘
```

---

# 35. Metrics cards

Example:

```text
Grounding Rate
94.2%
```

```text
Contradictions
12
```

```text
Avg Retrieval
210 ms
```

```text
Avg Generation
1.8 s
```

```text
Recovery Attempts
0.42 / generation
```

The values must come from backend data.

---

# 36. Evaluation details

Allow the user to select an evaluation:

```text
Evaluation #17
```

Then show:

```text
Dataset
Model version
Total examples
Correct
Incorrect
Entailment
Contradiction
Neutral
Latency
```

Only display metrics actually supplied by M3/M1/M2.

---

# 37. Model version

Display:

```text
Grounding Model
grounding-v1
```

This matters because different evaluations may use different ML models.

---

# 38. Request trace

Provide a useful debugging view:

```text
Request
req_123

Generation
gen_456

Retrieval
210 ms

Generation
1,420 ms

Verification
95 ms

Recovery
1 attempt

Total
1,900 ms
```

This can become extremely valuable during demos.

---

# 39. Developer page

Route:

```text
/projects/:projectId/developer
```

Show:

```text
API keys
API usage
Example request
Example response
API documentation
```

M3 owns the API.

M4 only presents it.

---

# 40. API key UI

Allow:

```text
Create API key
List keys
Revoke key
```

Never display an existing secret again if the backend intentionally stores only a hash.

---

# 41. Developer example

Show something like:

```text
POST /v1/projects/{projectId}/generations
```

with a copy button.

The actual request/response must stay synchronized with M3's contract.

Do not hard-code stale API examples.

---

# 42. Frontend API layer

Do not put raw fetch calls everywhere.

Create:

```text id="84p3um"
lib/api.ts
```

or separate API modules:

```text
projectsApi
documentsApi
generationsApi
claimsApi
evaluationsApi
```

Then UI components consume typed functions.

---

# 43. Shared types

Create frontend types matching M3's public contracts:

```text id="2rj8kw"
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

Don't duplicate API schemas manually in 15 components.

---

# 44. Contract synchronization

When M3 changes:

```text
GET /v1/claims/:claimId
```

M4 must update:

```text
types
API client
components
tests
```

Contract changes must be communicated between M3 and M4.

The project-wide rules explicitly require contract changes to be documented and reflected in types/tests. 

---

# 45. Loading states

Every asynchronous page needs:

```text id="7g8xq4"
loading
success
empty
error
```

Don't leave blank screens.

Example:

```text
Loading documents...
```

---

# 46. Empty states

Example:

```text
No documents yet.

Upload your first PDF to start asking grounded questions.
```

This makes the product feel complete.

---

# 47. Error states

Example:

```text
Unable to load project.

Request ID:
req_123

[Retry]
```

This is particularly useful because M3 provides request IDs.

---

# 48. Responsive design

At minimum:

```text id="d3m1a8"
desktop
tablet
mobile
```

The primary experience can be desktop-first because this is a research/developer application.

---

# 49. UI design direction

GroundGuard should feel:

```text
technical
trustworthy
clean
evidence-oriented
professional
```

Avoid making it look like a generic chatbot.

The unique visual identity should revolve around:

```text
claims
evidence
verification
recovery
```

---

# 50. Important UX principle

Do not make users understand ML terminology to use the product.

Instead of:

```text
NLI contradiction probability = 0.96
```

normal users can see:

```text
Contradicted
```

and optionally expand:

```text
Model score: 0.96
```

---

# 51. Docker ownership

M4 owns the integrated Docker setup.

The project should eventually run with something like:

```text
docker compose up
```

and bring up:

```text
web
api
ai
ml
postgres
redis
vector store
```

depending on the final architecture.

---

# 52. Docker architecture

Conceptually:

```text id="td6ibj"
docker-compose.yml
│
├── web
├── api
├── ai
├── ml
├── postgres
├── redis
└── vector-db
```

Not every component necessarily needs its own container if the final architecture combines infrastructure, but each application service should be independently runnable.

---

# 53. Environment variables

Frontend should use configuration such as:

```env
NEXT_PUBLIC_API_URL=http://localhost:4000
```

Backend:

```env
DATABASE_URL=
AI_SERVICE_URL=
ML_SERVICE_URL=
REDIS_URL=
AUTH_SECRET=
```

M2/M1 maintain their own service-specific variables.

---

# 54. `.env.example`

Commit:

```text id="7x3h1b"
.env.example
```

Never commit:

```text
.env
```

or:

```text
API keys
LLM keys
database passwords
auth secrets
```

The project-wide rules explicitly prohibit secrets in Git. 

---

# 55. Health checks

The integrated system should expose health information.

At minimum:

```text id="o3mlsm"
Web → API reachable
API → PostgreSQL reachable
API → AI reachable
AI → ML reachable
```

M4 should make these checks easy to inspect during deployment.

---

# 56. Monitoring

For MVP, keep it simple.

Monitor:

```text id="tq1d85"
service availability
HTTP errors
generation failures
latency
container health
```

Later:

```text
OpenTelemetry
Prometheus
Grafana
```

can be added if needed.

Don't overengineer monitoring for the MVP.

---

# 57. CI/CD

Set up GitHub Actions.

Basic pipeline:

```text id="v6f2p6"
Push / Pull Request
        ↓
Install
        ↓
Lint
        ↓
Typecheck
        ↓
Unit tests
        ↓
Build
        ↓
Docker build
```

For main:

```text
Tests pass
 ↓
Build image
 ↓
Deploy
```

Exact deployment target can be finalized by the team.

---

# 58. Frontend tests

You need:

```text id="l0f4z4"
component tests
API integration tests
E2E tests
```

Most important E2E scenario:

```text
Login
 ↓
Create project
 ↓
Upload document
 ↓
Wait for processing
 ↓
Open chat
 ↓
Ask question
 ↓
See answer
 ↓
See evidence
 ↓
See grounding result
```

---

# 59. Critical E2E scenario

Test the project's unique behavior:

```text id="h8tq0k"
Question
 ↓
Incorrect/unsupported claim
 ↓
Claim flagged
 ↓
Recovery shown
 ↓
Replacement claim
 ↓
Verified result
```

If this works smoothly, the core GroundGuard demo works.

---

# 60. Don't fake verification

For development, mocks are allowed.

For the integrated demo, don't make the frontend pretend a claim is verified.

The UI must reflect the actual backend result.

---

# 61. Frontend should not calculate verification

Don't write:

```text id="6p6j69"
if similarity > 0.8:
    show "verified"
```

That's M1's responsibility.

The frontend simply displays:

```text
M3 API result
```

---

# 62. Frontend should not retrieve documents

Don't write:

```text id="35a7zt"
Frontend → vector database
```

Correct:

```text id="o7v5ai"
Frontend
 ↓
M3
 ↓
M2
```

---

# 63. Frontend should not call LLM providers

No:

```text
OpenAI/Gemini/etc.
```

calls directly from the browser.

All AI requests go through M3.

---

# 64. Security basics

Never expose:

```text
LLM API keys
database credentials
M1 internal URLs
M2 internal URLs
private infrastructure credentials
```

to the browser.

Only expose intentionally public configuration such as:

```text
NEXT_PUBLIC_API_URL
```

---

# 65. Recommended implementation order

## Phase 1 — Frontend skeleton

```text
Next.js
TypeScript
Tailwind
shadcn
routing
layout
navigation
```

---

## Phase 2 — Authentication

```text
login
signup
session
logout
protected routes
```

---

## Phase 3 — Projects

```text
dashboard
create project
project list
project page
```

---

## Phase 4 — Knowledge Base

```text
upload
document list
status
delete
```

---

## Phase 5 — Chat

```text
conversation
question input
generation
answer
history
```

---

## Phase 6 — Streaming

```text
SSE
token streaming
generation status
live verification
```

---

## Phase 7 — Grounding UI

```text
claims
statuses
scores
evidence
source metadata
recovery
```

---

## Phase 8 — Evaluation

```text
metrics
evaluations
latency
model versions
request traces
```

---

## Phase 9 — Developer page

```text
API keys
API documentation
request examples
```

---

## Phase 10 — Docker

```text
web
api
ai
ml
database
infrastructure
```

---

## Phase 11 — CI/CD

```text
lint
typecheck
test
build
docker
deploy
```

---

# 66. Final acceptance criteria

M4 is complete when:

```text id="8l3zkm"
[ ] Next.js application works
[ ] Login UI works
[ ] Signup UI works
[ ] Dashboard works
[ ] Project management UI works
[ ] Knowledge Base works
[ ] Document upload works
[ ] Document status works
[ ] Chat works
[ ] Conversation history works
[ ] Generation streaming works
[ ] Claims are displayed
[ ] Grounding status is displayed
[ ] Grounding scores are displayed
[ ] Evidence is displayed
[ ] Source metadata is displayed
[ ] Contradictions are clearly shown
[ ] Recovery status is shown
[ ] Evaluation dashboard works
[ ] Model version is shown
[ ] Request trace is available
[ ] Developer/API page works
[ ] API-key management UI works
[ ] Responsive layout works
[ ] Loading states exist
[ ] Empty states exist
[ ] Error states exist
[ ] Docker works
[ ] Docker Compose works
[ ] Environment configuration works
[ ] Health checks exist
[ ] CI pipeline works
[ ] E2E test works
[ ] Local setup documentation exists
```

---

# 67. The complete M4 mental model

Keep this architecture in mind:

```text id="jxx4dg"
                         USER
                           │
                           ▼
                  ┌─────────────────┐
                  │    NEXT.JS      │
                  │      M4         │
                  └────────┬────────┘
                           │
                    REST + SSE
                           │
                           ▼
                  ┌─────────────────┐
                  │    NODE API     │
                  │      M3         │
                  └────────┬────────┘
                           │
             ┌─────────────┼─────────────┐
             ▼             ▼             ▼
          POSTGRES        M2            M1
             │             │             │
             │          RAG + LLM    Verification
             │             │             │
             └─────────────┴─────────────┘
                           │
                           ▼
                    VERIFIED RESULT
                           │
                           ▼
                        NEXT.JS
                           │
             ┌─────────────┼─────────────┐
             ▼             ▼             ▼
           ANSWER       EVIDENCE       METRICS
```

---

# 68. What the final product should feel like

A user should be able to do this without knowing anything about the underlying architecture:

```text
1. Sign in
2. Create project
3. Upload annual report
4. Wait for "Ready"
5. Ask:
   "What was the revenue?"
6. See answer
7. See source
8. Expand claim
9. See grounding result
10. See evidence
11. If claim fails:
       see recovery
12. Inspect project metrics
```

That is the product experience M4 owns.

---

# 69. One-line responsibility

> **M4 turns GroundGuard's backend, RAG, and grounding intelligence into a polished user-facing product while making the complete multi-service system reproducible, deployable, observable, and demo-ready.**

And the four members now fit together cleanly:

```text
M1 → Grounding intelligence
M2 → RAG + LLM + Recovery
M3 → Backend + Database + API + Orchestration
M4 → Frontend + DevOps + Evaluation UI
```

That is the complete isolated **Member 4** build context. 
