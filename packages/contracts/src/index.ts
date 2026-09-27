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
  text: string;
  status: ClaimStatus;
  verification?: VerificationResult;
  evidence?: Evidence[];
}

// Request & Response Payload Contracts
export interface GenerationRequestOptions {
  stream?: boolean;
  maxRecoveryAttempts?: number;
}

export interface GenerationRequest {
  query: string;
  conversationId?: string;
  options?: GenerationRequestOptions;
}

export interface GenerationMetadata {
  abstention: boolean;
  reason?: string;
  candidateCount?: number;
  evidenceCount?: number;
  omittedCount?: number;
  llmLatencyMs?: number;
  provider?: string;
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

export interface RecoverRequest {
  requestId: string;
  claimId: string;
  claim: string;
  evidence: Evidence[];
  failureReason: string;
}

export interface RecoverResponse {
  requestId: string;
  claimId: string;
  status: ClaimStatus;
  recoveredClaim?: string;
}

export interface VerifyRequest {
  requestId: string;
  claimId: string;
  claim: string;
  evidence: Array<{
    chunkId: string;
    text: string;
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
