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

export type { ProjectClaimItem, GroundedGenerationItem } from '@groundguard/types';

export async function getProjectClaims(projectId: string): Promise<ProjectClaimItem[]> {
  const res = await apiClient.get<{ claims: ProjectClaimItem[] }>(
    `/v1/projects/${projectId}/claims`
  );
  return res.claims || [];
}

export async function getProjectGroundedGenerations(projectId: string): Promise<GroundedGenerationItem[]> {
  const res = await apiClient.get<{ generations: GroundedGenerationItem[] }>(
    `/v1/projects/${projectId}/grounded-generations`
  );
  return res.generations || [];
}
