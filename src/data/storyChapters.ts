import { StoryChapter } from '../types/architecture';

export const STORY_CHAPTERS: StoryChapter[] = [
  // ==============================================================
  // 01: MEET GROUNDGUARD (Hero / Project Context)
  // ==============================================================
  {
    id: '01_meet_groundguard',
    index: 0,
    act: 'CUSTOMER JOURNEY',
    phaseCode: 'PROJECT: PUMP STATION ALPHA',
    title: 'GROUNDGUARD',
    subtitle: 'Verification-driven engineering intelligence.',
    summary: 'A customer hands GroundGuard engineering documents and asks a question. GroundGuard returns an answer it can prove.',
    keyConcepts: [
      'Project Documents',
      'Engineering Question',
      'Auditable Grounding'
    ],
    metrics: [
      { label: 'Project', value: 'Pump Station Alpha' },
      { label: 'Documents', value: '3 Connected' }
    ],
    highlightSubsystem: 'sentinel',
    activeRegion: 'idle',
    camera: {
      position: [0.75, 0.35, 4.4],
      target: [-0.08, 0.22, 0]
    },
    explodeProgress: 0,
    visualFlags: {
      trustCoreState: 'idle'
    }
  },

  // ==============================================================
  // 02: BUILD PROJECT KNOWLEDGE (Document Ingestion & Multi-Index)
  // ==============================================================
  {
    id: '02_build_knowledge',
    index: 1,
    act: 'CUSTOMER JOURNEY',
    phaseCode: 'PROJECT KNOWLEDGE',
    title: 'BUILD PROJECT KNOWLEDGE',
    subtitle: 'Engineering documents become searchable evidence.',
    summary: 'P-101A Pump Datasheet approaches, separates into pages, reveals structure, splits into chunks, and populates canonical and multi-index knowledge.',
    keyConcepts: [
      'P-101A Datasheet',
      'Chunk Decomposition',
      'Canonical Storage'
    ],
    metrics: [
      { label: 'Source', value: 'P-101A Datasheet' },
      { label: 'Ingest', value: 'Left Palm' }
    ],
    highlightSubsystem: 'left_arm',
    activeRegion: 'left_arm',
    camera: {
      position: [-0.65, 0.35, 4.0],
      target: [-0.10, 0.20, 0]
    },
    explodeProgress: 0,
    visualFlags: {
      showIngestionDoc: true,
      trustCoreState: 'idle'
    }
  },

  // ==============================================================
  // 03: ASK A QUESTION
  // ==============================================================
  {
    id: '03_ask',
    index: 2,
    act: 'CUSTOMER JOURNEY',
    phaseCode: 'CUSTOMER QUESTION',
    title: 'ASK GROUNDGUARD',
    subtitle: 'What is the rated flow rate and maximum discharge pressure of P-101A?',
    summary: 'The query packet enters the left intake aperture and routes up the central spinal bus toward the intelligence chamber.',
    keyConcepts: [
      'Equipment Tag P-101A',
      'Operating Metrics',
      'Spinal Bus Routing'
    ],
    metrics: [
      { label: 'Target', value: 'P-101A Specs' },
      { label: 'Route', value: 'Spinal Bus' }
    ],
    highlightSubsystem: 'spine',
    activeRegion: 'spine',
    camera: {
      position: [-0.35, 0.38, 4.0],
      target: [-0.05, 0.24, 0]
    },
    explodeProgress: 0,
    visualFlags: {
      showQueryPacket: true,
      trustCoreState: 'idle'
    }
  },

  // ==============================================================
  // 04: FIND EVIDENCE & DRAFT ANSWER
  // ==============================================================
  {
    id: '04_find_evidence',
    index: 3,
    act: 'CUSTOMER JOURNEY',
    phaseCode: 'EVIDENCE',
    title: 'FIND EVIDENCE',
    subtitle: 'Meaning • Exact identifiers • Relationships',
    summary: 'Head searches dense semantic, exact lexical tokens, and relations. Evidence candidates fuse in RRF, refine through FlashRank, surface the source datasheet, and synthesize a draft.',
    keyConcepts: [
      'Dense • Exact • Relations',
      'RRF & FlashRank',
      'Draft: 120 m³/h, 15.2 bar'
    ],
    metrics: [
      { label: 'Routes', value: '3 Streams' },
      { label: 'Status', value: 'Draft (Cyan)' }
    ],
    highlightSubsystem: 'brain',
    activeRegion: 'head',
    camera: {
      position: [0.0, 0.65, 3.9],
      target: [0.0, 0.45, 0]
    },
    explodeProgress: 0,
    visualFlags: {
      showQueryPacket: true,
      showHybridSplit: true,
      showRerankLattice: true,
      showGenerationCore: true,
      trustCoreState: 'idle'
    }
  },

  // ==============================================================
  // 05: VERIFY EVERY CLAIM
  // ==============================================================
  {
    id: '05_verify',
    index: 4,
    act: 'CUSTOMER JOURNEY',
    phaseCode: 'VERIFY',
    title: 'VERIFY CLAIMS',
    subtitle: 'Every factual claim is checked before release.',
    summary: 'Draft splits into Claim 01 (120 m³/h) and Claim 02 (15.2 bar). Claim 01 passes green. Claim 02 triggers conflict: 15.2 ≠ 12.5 bar, and is blocked red by the trust gate.',
    keyConcepts: [
      'Claim 01: 120 m³/h [VERIFIED]',
      'Claim 02: 15.2 ≠ 12.5 bar',
      'Fail-Closed Block'
    ],
    metrics: [
      { label: 'Claim 01', value: 'Pass (Green)' },
      { label: 'Claim 02', value: 'Blocked (Red)' }
    ],
    highlightSubsystem: 'trust_core',
    activeRegion: 'chest',
    camera: {
      position: [0.20, 0.35, 3.9],
      target: [0.0, 0.22, 0.12]
    },
    explodeProgress: 0,
    visualFlags: {
      showClaimCards: true,
      trustCoreState: 'contradiction'
    }
  },

  // ==============================================================
  // 06: RECOVER FAILED CLAIM
  // ==============================================================
  {
    id: '06_recover',
    index: 5,
    act: 'CUSTOMER JOURNEY',
    phaseCode: 'RECOVER',
    title: 'RECOVERY LOOP',
    subtitle: 'Repair only what failed. Then verify again.',
    summary: 'Blocked claim turns amber and ascends spine into head. Targeted retrieval retrieves canonical 12.5 bar. Value morphs 15.2 -> 12.5 bar, returns down spine to Trust Core, and reverifies to green.',
    keyConcepts: [
      'Spine Bus Loop',
      'Canonical 12.5 bar',
      'Claim 02: [RECOVERED]'
    ],
    metrics: [
      { label: 'Revision', value: '12.5 bar' },
      { label: 'Verdict', value: 'Recovered (Green)' }
    ],
    highlightSubsystem: 'trust_core',
    activeRegion: 'chest',
    camera: {
      position: [0.28, 0.40, 3.9],
      target: [0.05, 0.28, 0.10]
    },
    explodeProgress: 0,
    visualFlags: {
      showClaimCards: true,
      showRecoveryBranch: true,
      trustCoreState: 'recovery'
    }
  },

  // ==============================================================
  // 07: INSPECT TRUSTED ANSWER
  // ==============================================================
  {
    id: '07_inspect_answer',
    index: 6,
    act: 'CUSTOMER JOURNEY',
    phaseCode: 'OUTPUT',
    title: 'TRUSTED ANSWER',
    subtitle: 'Return evidence-backed engineering intelligence.',
    summary: 'Verified stream travels down right arm to palm, constructing the verified response card. Customer can inspect exact source evidence and recovery audit history.',
    keyConcepts: [
      '120 m³/h [VERIFIED]',
      '12.5 bar [RECOVERED]',
      'Evidence Attached'
    ],
    metrics: [
      { label: 'Claims', value: '2 Verified' },
      { label: 'Audit Trail', value: 'Interactive' }
    ],
    highlightSubsystem: 'right_arm',
    activeRegion: 'right_arm',
    camera: {
      position: [0.65, 0.35, 4.0],
      target: [0.10, 0.20, 0]
    },
    explodeProgress: 0,
    visualFlags: {
      showOutputAssembly: true,
      showVerifiedBadge: true,
      trustCoreState: 'verified'
    }
  }
];
