# GroundGuard — 3D Architecture Experience

A cinematic, interactive 3D technical product visualization of **GroundGuard**, a verification-driven engineering intelligence system.

This project physicalizes the GroundGuard architecture into an engineered guardian object — the **GroundGuard Sentinel** — demonstrating how complex engineering queries and documents undergo ingestion, multi-modal hybrid retrieval, reciprocal rank fusion (RRF), FlashRank reranking, context-constrained Gemini generation, atomic claim extraction, dual semantic/technical verification via M1 DeBERTa, and automated recovery loops.

---

## 1. Absolute Repository Isolation

> **NOTE:** This repository is completely isolated from the core GroundGuard application repository. It does not import, symlink, or modify any backend, frontend, database, or API contract files in GroundGuard. It functions as an independent presentation and storytelling asset.
>
> **Future Product Integration:**  
> The main GroundGuard application UI can include a simple external link or action button (e.g. `View System Architecture` or `Explore GroundGuard System`) that opens this standalone web application in a new browser tab.

---

## 2. Architecture Metaphor Mapping

| Body Region | System Subsystem | Technical Implementation | Core Function |
| :--- | :--- | :--- | :--- |
| **Head / Brain** | **M2 Intelligence / RAG** | Qdrant, Tantivy, NetworkX, RRF, FlashRank, Gemini LLM | Query understanding, hybrid retrieval routing, candidate fusion, reranking, and draft grounded answer synthesis. |
| **Chest / Heart** | **M1 Verification Core** | DeBERTa NLI, Deterministic Number/Unit/Tag Rules | Decomposes answers into atomic propositions. Performs dual-stage verification: semantic entailment + deterministic conflict detection. |
| **Spine / Nervous System** | **M3 Orchestration** | Fastify Gateway, Request Routing, Boundary Lock, SSE | Orchestrates request lifecycle, enforces zero-leak tenant boundaries, tracks state transitions, and coordinates recovery dispatch. |
| **Torso / Knowledge Chamber** | **Knowledge & State Layer** | PostgreSQL, Qdrant, Tantivy, NetworkX, Redis | Canonical durable state (PostgreSQL), 1536D semantic vectors (Qdrant), BM25 lexical tokens (Tantivy), and equipment graph relations (NetworkX). |
| **Left Arm & Hand** | **Input / Ingestion Port** | PDF & OCR Parser, Chunker, Tag Normalizer | Intake port for engineering P&IDs, manuals, and questions. Performs sequential validation, parsing, chunking, and tag extraction. |
| **Right Arm & Hand** | **Trusted Output Port** | Provenance Binder, Audit Stamper, Holographic Release | Emits strictly verified and recovered payloads. Blocks unverified or conflicting data from escaping the system boundary. |
| **Lower Plinth / Base** | **Infrastructure Substrate** | Docker Containers, Isolated Services, Net Mesh | Understated foundation representing containerized microservices and zero-trust communication. |

---

## 3. Technology Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **3D Engine**: Three.js + React Three Fiber (`@react-three/fiber`)
- **3D Utilities**: `@react-three/drei`
- **Styling**: Tailwind CSS (dark graphite palette, glassmorphism, responsive HUD)
- **Icons**: `lucide-react`
- **Animation**: Real-time procedural interpolation & physics lerping

---

## 4. Development & Build Commands

```bash
# Install dependencies
npm install

# Start development server on port 3005
npm run dev

# Create optimized production build
npm run build

# Start production server
npm start
```

---

## 5. Story Narrative Arc (18 Chapters)

1. **Act I: Hero & Arrival** — Full-body cinematic stance with idle floating oscillation and subtle breathing.
2. **Act I: System Awakening** — Visor activates, spine conduits ignite, chest core illuminates, top-level architecture layers emerge.
3. **Act II: Exploded System** — Mechanical segmentation: skull plates separate, chest armor slides open, torso modules extend, revealing the internal nervous system.
4. **Act III: Input & Ingestion** — Engineering document enters left palm; sequential pipeline stages: `Validate` → `Parse` → `Normalize` → `Chunk` → `Identify` → `Embed`.
5. **Act III: Knowledge Chamber** — Torso unifies PostgreSQL canonical state with Qdrant, Tantivy, NetworkX, and Redis.
6. **Act III: Query Arrival** — Real-world engineering prompt arrives: *"What is the rated flow rate and maximum discharge pressure of P-101A?"*.
7. **Act III: Hybrid Retrieval Brain** — Query splits into Dense (semantic), Lexical (tag P-101A), and Graph (topology) pathways.
8. **Act III: Fusion & Reranking** — Reciprocal Rank Fusion (RRF) and FlashRank cross-encoder eliminate low-relevance noise.
9. **Act III: Grounded Generation** — Gemini inference crystal generates draft response: *"120 m³/h and 15.2 bar"*. Output remains unverified Cyan.
10. **Act III: Claim Decomposition** — Splits into Claim 01 (`120 m³/h`) and Claim 02 (`15.2 bar`) with granular provenance links.
11. **Act III: Trust Core Verification** — Claim 01 passes DeBERTa entailment and numeric validation, turning vibrant Emerald Green.
12. **Act III: Contradiction Interception** — Claim 02 conflicts with canonical evidence (15.2 bar vs 12.5 bar spec). Turns Crimson Red and is diverted into the recovery bypass.
13. **Act III: Targeted Recovery Loop** — Amber loop dispatches targeted query, retrieves true 12.5 bar spec, and applies constrained revision.
14. **Act III: Trust Core Reverification** — Revised proposition passes second verification check, turning Green with `[RECOVERED]` status.
15. **Act III: Trusted Output Assembly** — Both verified claims stage into right arm conduit alongside audit provenance.
16. **Act IV: System Reassembly** — Armor plates smoothly lock back into cohesive guardian silhouette.
17. **Act V: Cinematic Live Flow** — Real-time automated execution sequence tracing the complete data cycle from left to right hand.
18. **Act VI: GroundGuard Verified Finale** — Product signature mark with emblem lock: `GROUNDGUARD VERIFIED: Retrieve • Verify • Recover`.

---

## 6. Deployment Readiness

- **Zero Secret Dependencies**: Runs entirely self-contained without requiring live database connections or external API keys.
- **Edge & Static Compatible**: Optimized for Vercel, Netlify, Cloudflare Pages, or containerized Docker hosting.
- **Performance Optimized**: DPR capped at 2.0, procedural geometry instancing, shared materials, and lazy-loaded WebGL canvas.
