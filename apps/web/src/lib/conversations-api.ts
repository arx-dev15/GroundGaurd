import { apiClient } from './api-client';
import type {
  Conversation,
  Message,
  Claim,
  RecoveryAttempt,
  ProjectClaimItem,
  GroundedGenerationItem,
} from '@groundguard/types';

export interface SendMessageResponse {
  requestId: string;
  generationId: string;
  conversationId: string;
  status: 'completed' | 'failed';
  answer?: string;
  evidence?: any[];
  sufficiency?: any;
  claims?: Claim[];
  modelVersion?: string;
  metadata?: any;
  userMessage: Message;
  message?: Message;
  error?: {
    code: string;
    message: string;
  };
}

export async function listConversations(projectId: string): Promise<Conversation[]> {
  const res = await apiClient.get<{ conversations: Conversation[] }>(
    `/v1/projects/${projectId}/conversations`
  );
  return res.conversations || [];
}

export async function createConversation(
  projectId: string,
  title?: string
): Promise<Conversation> {
  const res = await apiClient.post<{ conversation: Conversation }>(
    `/v1/projects/${projectId}/conversations`,
    { title }
  );
  return res.conversation;
}

export async function listMessages(
  projectId: string,
  conversationId: string
): Promise<Message[]> {
  const res = await apiClient.get<{ messages: Message[] }>(
    `/v1/projects/${projectId}/conversations/${conversationId}/messages`
  );
  return res.messages || [];
}

export async function sendMessage(
  projectId: string,
  conversationId: string,
  content: string
): Promise<SendMessageResponse> {
  return apiClient.post<SendMessageResponse>(
    `/v1/projects/${projectId}/conversations/${conversationId}/messages`,
    { content }
  );
}

export async function getGenerationClaims(generationId: string): Promise<Claim[]> {
  const res = await apiClient.get<{ claims: Claim[] }>(
    `/v1/generations/${generationId}/claims`
  );
  return res.claims || [];
}

export async function getClaimRecoveryAttempts(claimId: string): Promise<RecoveryAttempt[]> {
  try {
    const res = await apiClient.get<{ recoveryAttempts: RecoveryAttempt[] }>(
      `/v1/claims/${claimId}/recovery-attempts`
    );
    return res.recoveryAttempts || [];
  } catch {
    return [];
  }
}

export async function retryClaim(claimId: string): Promise<{ claim: Claim; recoveryAttempts: RecoveryAttempt[] }> {
  return apiClient.post<{ claim: Claim; recoveryAttempts: RecoveryAttempt[] }>(
    `/v1/claims/${claimId}/retry`
  );
}

export type { ProjectClaimItem, GroundedGenerationItem, Evaluation } from '@groundguard/types';

export interface GetProjectClaimsOptions {
  limit?: number;
  offset?: number;
  status?: string | string[];
}

export interface PaginatedClaimsResponse {
  claims: ProjectClaimItem[];
  total: number;
  hasMore: boolean;
}

export async function getProjectClaims(
  projectId: string,
  options?: GetProjectClaimsOptions
): Promise<ProjectClaimItem[]> {
  const params = new URLSearchParams();
  if (options?.limit !== undefined) params.set('limit', String(options.limit));
  if (options?.offset !== undefined) params.set('offset', String(options.offset));
  if (options?.status) {
    const s = Array.isArray(options.status) ? options.status.join(',') : options.status;
    params.set('status', s);
  }
  const qs = params.toString();
  const res = await apiClient.get<{
    claims: ProjectClaimItem[];
    items?: ProjectClaimItem[];
    pagination?: { total: number; limit: number; offset: number; hasMore: boolean };
  }>(`/v1/projects/${projectId}/claims${qs ? `?${qs}` : ''}`);
  return res.items || res.claims || [];
}

export async function getProjectClaimsPaginated(
  projectId: string,
  options?: GetProjectClaimsOptions
): Promise<PaginatedClaimsResponse> {
  const params = new URLSearchParams();
  if (options?.limit !== undefined) params.set('limit', String(options.limit));
  if (options?.offset !== undefined) params.set('offset', String(options.offset));
  if (options?.status) {
    const s = Array.isArray(options.status) ? options.status.join(',') : options.status;
    params.set('status', s);
  }
  const qs = params.toString();
  const res = await apiClient.get<{
    claims: ProjectClaimItem[];
    items?: ProjectClaimItem[];
    pagination?: { total: number; limit: number; offset: number; hasMore: boolean };
  }>(`/v1/projects/${projectId}/claims${qs ? `?${qs}` : ''}`);

  const rawItems = res.items || res.claims || [];

  // If backend provided pagination metadata, it already sliced the items
  if (res.pagination) {
    return {
      claims: rawItems,
      total: res.pagination.total,
      hasMore: res.pagination.hasMore,
    };
  }

  // Fallback: If backend is running without pagination support (e.g. dev server without hot reload),
  // filter and slice client-side so exactly `limit` claims are returned per page.
  let filtered = rawItems;
  if (options?.status) {
    const allowed = Array.isArray(options.status) ? options.status : [options.status];
    if (allowed.length > 0) {
      filtered = rawItems.filter((c) => allowed.includes(c.status));
    }
  }

  const limit = options?.limit ?? 6;
  const offset = options?.offset ?? 0;
  const total = filtered.length;
  const pagedItems = filtered.slice(offset, offset + limit);

  return {
    claims: pagedItems,
    total,
    hasMore: offset + limit < total,
  };
}

export async function getProjectEvaluations(projectId: string): Promise<any[]> {
  try {
    const res = await apiClient.get<{ evaluations: any[] }>(
      `/v1/projects/${projectId}/evaluations`
    );
    return res.evaluations || [];
  } catch {
    return [];
  }
}

export async function getProjectGroundedGenerations(projectId: string): Promise<GroundedGenerationItem[]> {
  const res = await apiClient.get<{ generations: GroundedGenerationItem[] }>(
    `/v1/projects/${projectId}/grounded-generations`
  );
  return res.generations || [];
}
