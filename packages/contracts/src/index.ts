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
  metadata?: Record<string, unknown>;
}

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

export interface GenerationResult {
  requestId: string;
  generationId: string;
  status: GenerationStatus;
  answer?: string;
  claims?: Claim[];
  error?: {
    code: string;
    message: string;
  };
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
}

export interface RetrieveRequest {
  projectId: string;
  query: string;
  topK?: number;
}

export interface RetrieveResult {
  results: Evidence[];
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
