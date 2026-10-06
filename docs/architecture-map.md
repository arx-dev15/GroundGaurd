# GroundGuard 3D Architecture Mapping Specification

This document details the exact spatial, structural, and state mappings between the GroundGuard production software architecture and the GroundGuard Sentinel 3D visualization.

## 1. System Zone Mapping

```
                         GROUNDGUARD SENTINEL
                                   │
             ┌─────────────────────┼─────────────────────┐
             │                     │                     │
           BRAIN                 HEART                 SPINE
      M2 Intelligence         Trust Core           M3 Orchestration
             │                     │                     │
             └────────────── KNOWLEDGE CORE ─────────────┘
                                   │
                    LEFT ARM       │       RIGHT ARM
                Input / Ingest     │    Verified Output
```

### Detailed Zone Specifications

#### A. Head / Brain (M2 RAG & Cognitive Intelligence)
- **Visual Representation**: Armored cranial shell with lateral temporal fins and optical data visor.
- **Exploded Behavior**: Left/right skull plates separate horizontally by 0.45 units; upper crest ascends; exposes the glowing cyan synaptic lattice and internal Gemini inference octahedron crystal.
- **System Mappings**:
  - *Query Routing*: Validates incoming intent and selects required indices.
  - *Dense Retrieval*: Connects to Qdrant for semantic 1536D vector searches.
  - *Lexical Retrieval*: Connects to Tantivy for BM25 keyword/identifier searches (`P-101A`).
  - *Graph Retrieval*: Connects to NetworkX for relational equipment topologies.
  - *Fusion & Reranking*: Reciprocal Rank Fusion (RRF) and FlashRank cross-encoder reduce candidate pool.
  - *Grounded Generation*: Context-restricted synthesis with Gemini. Status remains strictly Cyan (Draft / Unverified).

#### B. Chest / Heart (M1 Trust Core & Verification Reactor)
- **Visual Representation**: Central gimbal reactor with an inner rotating semantic entailment crystal and an outer notched ring representing deterministic engineering rules.
- **Exploded Behavior**: Left and right protective breastplates slide outward and rotate forward, framing the Trust Core.
- **Color States**:
  - `Cyan`: Idle / Evaluating
  - `Green (#10b981)`: Verified / Entailment (Claim 01: 120 m³/h PASS)
  - `Red (#ef4444)`: Contradiction / Conflict (Claim 02: 15.2 bar ≠ 12.5 bar spec)
  - `Amber (#f59e0b)`: Recovery active (re-querying canonical knowledge)
- **System Mappings**:
  - *M1 DeBERTa NLI*: Assesses proposition entailment, contradiction, and neutral support against source text.
  - *Deterministic Verifier*: Validates numbers, units, equipment tags, dates, and sign conventions.

#### C. Spine / Nervous System (M3 Backend Orchestration)
- **Visual Representation**: Vertical segmented vertebrae column with luminescent central fiber conduit and lateral rib nerves.
- **System Mappings**:
  - Fastify API gateway and request routing.
  - Tenant and project boundary isolation.
  - State machine lifecycle coordination and SSE telemetry streaming.
  - Fail-closed audit ledger.

#### D. Torso / Internal Knowledge Chamber (State Layer)
- **Visual Representation**: Four modular housings arrayed around the central spine, plus a transient collar ring.
- **Modules**:
  - *PostgreSQL*: Stacked blue ledger bars representing canonical durable records.
  - *Qdrant*: Dense 3D point lattice representing high-dimensional vector space.
  - *Tantivy*: Vertical index columns representing inverted BM25 token postings.
  - *NetworkX*: Node-edge 3D constellation representing equipment connectivity graphs.
  - *Redis*: Fast pulsing red/amber ring representing ephemeral coordination events.

#### E. Left Arm & Hand (Ingestion & Input Port)
- **Visual Representation**: Segmented mechanical arm with forearm stages and palm intake aperture.
- **System Mappings**:
  - Intake for engineering documents (P&IDs, datasheets) and questions.
  - Sequential stages: Validate → Parse → Normalize → Chunk → Identify Tag → Embed.

#### F. Right Arm & Hand (Trusted Output Port)
- **Visual Representation**: Arm conduit with verified stage receivers and palm emission aperture with holographic lens.
- **System Mappings**:
  - Releases only verified and recovered answers.
  - Attaches tamper-evident audit tokens and provenance anchors.

#### G. Recovery Bypass (Phase 8 Remediation)
- **Visual Representation**: Amber optical bypass pipeline branching from below the Trust Core, looping along the right flank, and returning to the Trust Core for reverification.

---

## 2. Real System Invariants Represented

1. **Relevance is NOT Verification**: Retrieved candidates are displayed as candidates, never pre-marked as true.
2. **Drafts are Unverified**: Generation is displayed in Cyan, never Green, until verified by the Trust Core.
3. **Fail-Closed Guardrails**: Contradictions (15.2 bar vs 12.5 bar) turn Red immediately and are physically diverted from exiting the system.
4. **Recovery Must Reverify**: Repaired propositions must re-enter the Trust Core and pass both semantic and deterministic checks before receiving the Green `[RECOVERED]` stamp.
