/**
 * GroundGuard Shared Contracts & Identifiers
 */

// Status Definitions
export type DocumentStatus = 'uploaded' | 'processing' | 'ready' | 'failed';

export type GenerationStatus =
  | 'queued'
  | 'retrieving'
  | 'generating'
  | 'verifying'
  | 'recovering'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type ClaimStatus =
  | 'pending'
  | 'verified'
  | 'flagged'
  | 'recovered'
  | 'needs_review';

export type VerificationLabel = 'entailment' | 'contradiction' | 'neutral';

// Domain Entities (Public Representations)
export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export type MessageRole = 'user' | 'assistant' | 'system';

export interface Conversation {
  id: string;
  projectId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  generationId?: string;
  createdAt: string;
}

export interface CreateConversationRequest {
  title?: string;
}

export interface ConversationListResponse {
  conversations: Conversation[];
}

export interface MessageListResponse {
  messages: Message[];
}

// Authentication Payloads
export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}

// Project Payloads
export interface CreateProjectRequest {
  name: string;
  description?: string;
}

export interface UpdateProjectRequest {
  name?: string;
  description?: string;
}

export interface ProjectListResponse {
  projects: Project[];
}

// Document Domain Entity & Payloads
export interface Document {
  id: string;
  projectId: string;
  filename: string;
  fileSize: number;
  mimeType: string;
  status: DocumentStatus;
  errorMessage?: string;
  chunksCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentListResponse {
  documents: Document[];
}

export interface DocumentStatusResponse {
  documentId: string;
  status: DocumentStatus;
  chunksCount: number;
  errorMessage?: string;
}

// Common Objects
export interface Evidence {
  evidenceId?: string;
  chunkId: string;
  documentId?: string;
  text: string;
  pageNumber?: number;
  section?: string;
  heading?: string;
  identifiers?: string[];
  sources?: string[];
  rrfScore?: number;
  rerankScore?: number;
  score?: number;
  graphRelations?: Record<string, unknown>[];
  metadata?: Record<string, unknown>;
}

export type EvidenceItem = Evidence;

export interface VerificationResult {
  label: VerificationLabel;
  scores: {
    entailment: number;
    contradiction: number;
    neutral: number;
  };
  groundingScore: number;
  modelVersion: string;
}

export interface Claim {
  claimId: string;
  externalClaimId?: string;
  text: string;
  status: ClaimStatus;
  ordinal?: number;
  sourceText?: string;
  verification?: VerificationResult;
  evidence?: EvidenceItem[];
  recovery?: {
    attempts: Array<Partial<RecoveryAttempt>>;
  };
}

export type ClaimItem = Claim;

// Request & Response Payload Contracts
export interface ConversationContextTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface GenerationRequestOptions {
  stream?: boolean;
  maxRecoveryAttempts?: number;
}

export interface GenerationRequest {
  query: string;
  conversationId?: string;
  options?: GenerationRequestOptions;
  conversationContext?: ConversationContextTurn[];
}

export interface GenerationMetadata {
  abstention: boolean;
  reason?: string;
  candidateCount?: number;
  evidenceCount?: number;
  omittedCount?: number;
  llmLatencyMs?: number;
  provider?: string;
  claimExtraction?: {
    status: string;
    claimCount?: number;
    error?: string;
  };
  [key: string]: unknown;
}

export interface GenerationResult {
  requestId: string;
  generationId: string;
  conversationId?: string;
  status: GenerationStatus;
  answer?: string;
  claims?: Claim[];
  evidence?: EvidenceItem[];
  sufficiency?: EvidenceSufficiency;
  modelVersion?: string;
  metadata?: GenerationMetadata;
  error?: {
    code: string;
    message: string;
  };
}

export interface CreateGenerationResponse {
  requestId: string;
  generationId: string;
  status: GenerationStatus;
}

export interface ClaimListResponse {
  claims: Claim[];
}

export interface ProjectClaimItem extends Claim {
  generationId?: string;
  conversationId?: string;
  conversationTitle?: string;
  query?: string;
  createdAt?: string;
}

export interface PaginationInfo {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface ProjectClaimsResponse {
  claims: ProjectClaimItem[];
  items?: ProjectClaimItem[];
  pagination?: PaginationInfo;
}

export interface GroundedGenerationItem {
  generationId: string;
  conversationId: string | null;
  conversationTitle: string;
  query: string;
  createdAt: string;
  claimCounts: {
    total: number;
    verified: number;
    flagged: number;
    recovered: number;
    needsReview: number;
  };
  sources: string[];
}

export interface ProjectGroundedGenerationsResponse {
  generations: GroundedGenerationItem[];
}

export interface EvidenceListResponse {
  evidence: Evidence[];
}

export interface Identifier {
  value: string;
  normalized: string;
  type: string;
}

export interface ChunkLineage {
  chunkId: string;
  documentId: string;
  projectId: string;
  chunkIndex: number;
  pageNumber: number;
  section?: string;
  heading?: string;
  identifiers: Identifier[];
}

export interface IndexStatus {
  qdrant: boolean;
  tantivy: boolean;
  networkx: boolean;
  graphEdgesCount: number;
  qdrantCount?: number;
  tantivyCount?: number;
}

export interface DeleteDocumentResponse {
  success: boolean;
  documentId: string;
  projectId: string;
  error?: string;
}

export interface ChunkDTO {
  id: string;
  chunk_index?: number;
  chunkIndex?: number;
  page_number?: number;
  pageNumber?: number;
  text: string;
  section?: string;
  heading?: string;
  identifiers?: Identifier[];
  identifierKeys?: string[];
  metadata?: Record<string, unknown>;
}

export interface IngestRequest {
  documentId: string;
  projectId: string;
  filePath: string;
}

export interface IngestResponse {
  documentId: string;
  status: 'ready' | 'failed' | 'completed';
  chunksCreated: number;
  errorMessage?: string;
  indexStatus?: IndexStatus;
  chunks?: ChunkDTO[];
}

export interface RetrieveRequest {
  projectId: string;
  query: string;
  topK?: number;
}

export interface EvidenceSufficiencySignals {
  resultCount: number;
  topRerankScore: number;
  identifierMatched: boolean;
  sourceCoverage: string[];
  conflictingEvidence?: boolean;
  conflictType?: string;
  conflictingDocumentIds?: string[];
  conflictingChunkIds?: string[];
  conflictSummary?: string;
  scopeDecision?: string;
  scopeReason?: string;
  conflictConfidence?: number;
  conflictDetectionMethod?: string;
  revisionResolution?: string;
  evidenceCoverageScore?: number;
  topicSimilarityScore?: number;
}

export interface EvidenceSufficiency {
  sufficient: boolean;
  reason: string;
  score: number;
  signals: EvidenceSufficiencySignals;
}

export interface RetrieveMetadata {
  selectedSources: string[];
  denseCandidateCount: number;
  lexicalCandidateCount: number;
  graphCandidateCount: number;
  fusedCandidateCount: number;
  rerankedCandidateCount: number;
  finalCandidateCount: number;
  latencyMs: number;
  routeDecision?: {
    dense: boolean;
    lexical: boolean;
    graph: boolean;
    identifierQuery: boolean;
    extractedIdentifiers: string[];
    relationshipIntent: boolean;
    reasons: string[];
  };
}

export interface RetrieveResult {
  results: Evidence[];
  sufficiency?: EvidenceSufficiency;
  metadata?: RetrieveMetadata;
}

export type RecoveryFailureReason =
  | 'CONTRADICTION'
  | 'INSUFFICIENT_EVIDENCE'
  | 'TECHNICAL_CONFLICT'
  | 'ZERO_EVIDENCE'
  | 'M1_UNAVAILABLE';

export type RecoveryAction = 'keep' | 'revise' | 'abstain';

export interface RecoverRequest {
  requestId?: string;
  projectId: string;
  claimId: string;
  claim: string;
  failureReason: RecoveryFailureReason | string;
  existingEvidence?: Evidence[];
  attempt?: number;
  /** Remaining generation recovery budget (ms); M2 bounds its provider HTTP wait by it. */
  deadlineMs?: number;
}

export interface RecoverResponse {
  requestId: string;
  claimId: string;
  action: RecoveryAction;
  candidateClaim: string;
  recoveryEvidence: Evidence[];
  modelVersion: string;
  reason?: string;
  /** Terminal failure category from M2: 'attempt_limit' | 'provider_unavailable' | 'retrieval_unavailable'. */
  failureType?: string;
}

export interface RecoveryAttempt {
  id: string;
  claimId: string;
  attemptNumber: number;
  failureReason: string;
  action: string;
  originalText: string;
  candidateText?: string | null;
  verificationLabel?: VerificationLabel | null;
  entailmentScore?: number | null;
  contradictionScore?: number | null;
  neutralScore?: number | null;
  groundingScore?: number | null;
  modelVersion?: string | null;
  recoveryModelVersion?: string | null;
  recoveryEvidence?: Array<{
    chunkId: string;
    documentId?: string;
    text: string;
    score?: number;
  }>;
  createdAt: string;
}

export interface VerifyRequest {
  requestId: string;
  claimId: string;
  claim: string;
  evidence: Array<{
    chunkId: string;
    text: string;
    /** Optional source context (document title / heading / preceding sentence) for subject-less chunks. */
    context?: string;
  }>;
}

export interface VerifyResponse {
  requestId: string;
  claimId: string;
  label: VerificationLabel;
  scores: {
    entailment: number;
    contradiction: number;
    neutral: number;
  };
  groundingScore: number;
  modelVersion: string;
}

// Error Contract
export interface APIErrorDetails {
  code: string;
  message: string;
}

export interface APIError {
  error: APIErrorDetails;
  requestId: string;
}

// SSE Event Contract
export interface SSEEvent {
  event: string;
  data: Record<string, unknown>;
}

export interface RetryClaimResponse {
  claim: Claim;
  recoveryAttempts: RecoveryAttempt[];
}

// API Key Contracts
export interface ApiKey {
  id: string;
  name: string;
  projectId?: string | null;
  keyPrefix: string;
  lastUsedAt?: string | null;
  expiresAt?: string | null;
  createdAt: string;
}

export interface CreateApiKeyRequest {
  name: string;
  projectId?: string;
  expiresAt?: string;
}

export interface CreateApiKeyResponse {
  apiKey: ApiKey;
  secretKey: string;
}

export interface ApiKeyListResponse {
  apiKeys: ApiKey[];
}

// Evaluation & Reliability Metrics Contracts
export interface EvaluationMetricSummary {
  totalCases: number;
  passedCases: number;
  passRate: number;
  entailmentPrecision?: number;
  contradictionRecall?: number;
  averageLatencyMs?: number;
  groundingPassRate?: number;
  [key: string]: unknown;
}

export interface Evaluation {
  id: string;
  projectId: string;
  name: string;
  status: 'running' | 'completed' | 'failed';
  dataset?: string;
  modelVersion?: string;
  metrics?: EvaluationMetricSummary;
  errorMessage?: string;
  createdAt: string;
  completedAt?: string;
}

export interface EvaluationResultCase {
  id: string;
  evaluationId: string;
  caseId: string;
  claim: string;
  expectedLabel?: string;
  predictedLabel?: string;
  groundingScore?: number;
  passed: boolean;
  latencyMs?: number;
  evidence?: unknown;
  createdAt: string;
}

export interface ProjectMetricsResponse {
  projectId: string;
  totalGenerations: number;
  completedGenerations: number;
  totalClaims: number;
  verifiedClaims: number;
  flaggedClaims: number;
  recoveredClaims: number;
  groundingPassRate: number;
  contradictionRate: number;
  recoverySuccessRate: number;
  averageLatencyMs: number;
}
