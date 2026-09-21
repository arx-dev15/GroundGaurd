/**
 * GroundGuard Shared Contracts & Identifiers
 */
export type DocumentStatus = 'uploaded' | 'processing' | 'ready' | 'failed';
export type GenerationStatus = 'queued' | 'retrieving' | 'generating' | 'verifying' | 'recovering' | 'completed' | 'failed' | 'cancelled';
export type ClaimStatus = 'pending' | 'verified' | 'flagged' | 'recovered' | 'needs_review';
export type VerificationLabel = 'entailment' | 'contradiction' | 'neutral';
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
    status: DocumentStatus;
    chunksCreated: number;
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
export interface APIErrorDetails {
    code: string;
    message: string;
}
export interface APIError {
    error: APIErrorDetails;
    requestId: string;
}
export interface SSEEvent {
    event: string;
    data: Record<string, unknown>;
}
