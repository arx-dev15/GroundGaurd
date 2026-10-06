export type SubsystemType = 
  | 'sentinel'
  | 'brain'
  | 'trust_core'
  | 'spine'
  | 'knowledge'
  | 'left_arm'
  | 'right_arm'
  | 'recovery'
  | 'base';

export type ActiveBodyRegion =
  | 'idle'
  | 'left_arm'
  | 'torso'
  | 'head'
  | 'chest'
  | 'spine'
  | 'right_arm';

export type ClaimVerificationStatus = 
  | 'pending'
  | 'evaluating'
  | 'verified'
  | 'contradiction'
  | 'recovered';

export interface ProjectDocument {
  id: string;
  filename: string;
  type: string;
  size: string;
  sourcePage?: number;
  highlightedText?: string;
}

export interface AtomicClaim {
  id: string;
  claimNumber: string;
  statement: string;
  expectedValue: string;
  actualEvidence: string;
  provenance: string;
  sourceDoc: string;
  sourcePage: number;
  status: ClaimVerificationStatus;
  semanticVerdict: 'ENTAILMENT' | 'CONTRADICTION' | 'NEUTRAL' | 'PENDING';
  technicalChecks: {
    numbers: 'PASS' | 'CONFLICT' | 'PENDING';
    units: 'PASS' | 'CONFLICT' | 'PENDING';
    identifiers: 'PASS' | 'CONFLICT' | 'PENDING';
  };
  recoveryAudit?: {
    originalValue: string;
    contradictionNote: string;
    canonicalEvidence: string;
    revisedValue: string;
    reverifiedStatus: string;
  };
}

export interface StoryChapter {
  id: string;
  index: number;
  act: string;
  phaseCode: string;
  title: string;
  subtitle: string;
  summary: string;
  keyConcepts: string[];
  metrics?: { label: string; value: string }[];
  highlightSubsystem?: SubsystemType;
  activeRegion?: ActiveBodyRegion;
  camera: {
    position: [number, number, number];
    target: [number, number, number];
  };
  explodeProgress: number; // 0 = closed/assembled
  visualFlags?: {
    showIngestionDoc?: boolean;
    showQueryPacket?: boolean;
    showHybridSplit?: boolean;
    showRerankLattice?: boolean;
    showGenerationCore?: boolean;
    showClaimCards?: boolean;
    trustCoreState?: 'idle' | 'evaluating' | 'verified' | 'contradiction' | 'recovery';
    showRecoveryBranch?: boolean;
    showReverification?: boolean;
    showOutputAssembly?: boolean;
    showVerifiedBadge?: boolean;
    activeConduits?: string[];
    underTheHood?: boolean;
    demoConflict?: boolean;
  };
}

export interface LiveFlowStep {
  id: string;
  label: string;
  subsystem: SubsystemType;
  description: string;
  color: string;
  duration: number; // in seconds
}
