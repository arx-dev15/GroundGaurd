import { SubsystemType, AtomicClaim } from '../types/architecture';

export interface SubsystemDetail {
  id: SubsystemType;
  name: string;
  code: string;
  role: string;
  color: string;
  description: string;
  components: string[];
  responsibilities: string[];
}

export const SUBSYSTEM_DETAILS: Record<SubsystemType, SubsystemDetail> = {
  sentinel: {
    id: 'sentinel',
    name: 'GroundGuard Sentinel',
    code: 'SYS-00',
    role: 'Cohesive Autonomous Engineering Guardian',
    color: '#00f0ff',
    description: 'The physical embodiment of GroundGuard verification architecture. Unifies cognition, state persistence, deterministic validation, and auditable emission into a single engineered organism.',
    components: ['Modular Hard-Surface Shell', 'Sensory Visor', 'Inter-Module Optical Conduits', 'Stabilizer Chassis'],
    responsibilities: ['Unified visual integrity', 'Lifecycle harmonization', 'Fail-closed containment']
  },
  brain: {
    id: 'brain',
    name: 'Cognitive Core & RAG Engine',
    code: 'M2-BRAIN',
    role: 'Query Understanding & Grounded Generation',
    color: '#a855f7',
    description: 'Executes multi-modal query routing, hybrid candidate retrieval (dense, lexical, graph), reciprocal rank fusion (RRF), FlashRank re-ranking, and context-bound Gemini generation.',
    components: ['Intent Router', 'Qdrant Dense Retriever', 'Tantivy Lexical Retriever', 'NetworkX Graph Extractor', 'FlashRank Cross-Encoder', 'Gemini Generation Engine'],
    responsibilities: ['Query parsing', 'Evidence sufficiency gating', 'Restricted draft synthesis']
  },
  trust_core: {
    id: 'trust_core',
    name: 'Verification Reactor / Trust Core',
    code: 'M1-TRUST',
    role: 'Dual-Stage Claim Grounding Validator',
    color: '#10b981',
    description: 'Decomposes draft answers into atomic propositions. Subject each proposition to M1 DeBERTa NLI cross-examination paired with deterministic checks for numbers, units, tags, and negation.',
    components: ['Proposition Decomposer', 'DeBERTa NLI Entailment Engine', 'Deterministic Number/Unit Evaluator', 'Entity Cross-Matcher', 'Fail-Closed Gate'],
    responsibilities: ['Entailment scoring', 'Contradiction interception', 'Numeric conflict detection', 'Provenance validation']
  },
  spine: {
    id: 'spine',
    name: 'M3 Orchestration & Nervous System',
    code: 'M3-SPINE',
    role: 'Central Control Bus & Boundary Enforcer',
    color: '#00f0ff',
    description: 'Coordinates request routing, project boundary isolation, SSE streaming telemetry, audit trail logging, and recovery lifecycle dispatch.',
    components: ['Fastify API Gateway', 'Project Boundary Guard', 'SSE Telemetry Bus', 'Audit Tracing Ledger', 'Recovery Dispatcher'],
    responsibilities: ['Request lifecycle coordination', 'Zero-leak tenant isolation', 'Real-time telemetry event bus']
  },
  knowledge: {
    id: 'knowledge',
    name: 'Knowledge & State Layer',
    code: 'STATE-CORE',
    role: 'Canonical Persistence & Multi-Index Store',
    color: '#38bdf8',
    description: 'Houses the canonical system truth in PostgreSQL while projecting optimized indices across Qdrant (semantic), Tantivy (lexical), and NetworkX (relational topology).',
    components: ['PostgreSQL (Canonical DB)', 'Qdrant (1536D Vectors)', 'Tantivy (BM25 Inverted)', 'NetworkX (Equipment Graph)', 'Redis (Transient Queue)'],
    responsibilities: ['Durable canonical state', 'High-recall vector search', 'Exact identifier matching', 'Equipment relation traversal']
  },
  left_arm: {
    id: 'left_arm',
    name: 'Ingestion & Input Port',
    code: 'IN-PORT',
    role: 'Document & Query Intake Conduit',
    color: '#06b6d4',
    description: 'Ingests complex engineering documents (P&IDs, datasheets, operating manuals) and user queries. Performs validation, parsing, normalization, chunking, and tag extraction.',
    components: ['Input Aperture', 'PDF & OCR Parser', 'Semantic Chunker', 'Tag Extractor (P-101A)', 'Normalization Pipeline'],
    responsibilities: ['Input validation', 'Format normalization', 'Metadata & tag anchoring']
  },
  right_arm: {
    id: 'right_arm',
    name: 'Auditable Output Port',
    code: 'OUT-PORT',
    role: 'Tamper-Evident Emission Manipulator',
    color: '#10b981',
    description: 'Emits only verified, provenance-backed answers. Prohibits any unverified or conflicting claims from escaping the system boundary.',
    components: ['Output Manipulator', 'Provenance Strand Binder', 'Audit Token Stamper', 'Holographic Emitter'],
    responsibilities: ['Safe payload release', 'Traceability attachment', 'User confidence assurance']
  },
  recovery: {
    id: 'recovery',
    name: 'Targeted Recovery Loop',
    code: 'PHASE-8-REC',
    role: 'Contradiction Diagnosis & Remediation',
    color: '#f59e0b',
    description: 'Activates upon contradiction or technical conflict detection. Isolates the invalid claim, issues targeted queries to canonical stores, applies constrained revisions, and returns to the trust core for reverification.',
    components: ['Conflict Diagnostician', 'Targeted Query Formulator', 'Constrained Revision Unit', 'Reverification Dispatcher'],
    responsibilities: ['Evidence-grounded claim repair', 'Targeted re-retrieval', 'Fail-closed fallback']
  },
  base: {
    id: 'base',
    name: 'Infrastructure & Container Runtime',
    code: 'INFRA-0',
    role: 'Execution Chassis & Deployment Foundation',
    color: '#64748b',
    description: 'Subtle containerized service foundations, Docker runtimes, network bridges, and resilient cloud execution substrate.',
    components: ['Docker Runtime', 'Container Mesh', 'Health Monitors', 'Zero-Trust Networks'],
    responsibilities: ['Subsystem uptime', 'Network containment', 'Resource isolation']
  }
};

export const DEMO_CLAIMS: AtomicClaim[] = [
  {
    id: 'claim-1',
    claimNumber: 'CLAIM 01',
    statement: 'P-101A has a rated flow rate of 120 m³/h',
    expectedValue: '120 m³/h',
    actualEvidence: 'Spec Sheet P-101A §3.1: "Rated Flow Rate: 120 m3/h at nominal RPM"',
    provenance: 'Doc: P101A_Equipment_Spec.pdf (Page 4, Table 2)',
    sourceDoc: 'P-101A Pump Datasheet.pdf',
    sourcePage: 3,
    status: 'verified',
    semanticVerdict: 'ENTAILMENT',
    technicalChecks: {
      numbers: 'PASS',
      units: 'PASS',
      identifiers: 'PASS'
    }
  },
  {
    id: 'claim-2',
    claimNumber: 'CLAIM 02',
    statement: 'P-101A maximum discharge pressure is 15.2 bar',
    expectedValue: '12.5 bar',
    actualEvidence: 'Spec Sheet P-101A §3.4: "Maximum Allowable Working Discharge Pressure: 12.5 bar g"',
    provenance: 'Doc: P101A_Equipment_Spec.pdf (Page 5, Section 3.4)',
    sourceDoc: 'P-101A Pump Datasheet.pdf',
    sourcePage: 3,
    status: 'contradiction',
    semanticVerdict: 'CONTRADICTION',
    technicalChecks: {
      numbers: 'CONFLICT',
      units: 'PASS',
      identifiers: 'PASS'
    }
  }
];
