import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listConversations,
  listMessages,
  sendMessage,
  createConversation,
  getGenerationClaims,
  getClaimRecoveryAttempts,
} from './conversations-api';
import type { Conversation, Message, Claim, RecoveryAttempt } from '@groundguard/types';

export const conversationQueryKeys = {
  all: ['conversations'] as const,
  projectList: (projectId: string) => ['projects', projectId, 'conversations'] as const,
  messages: (conversationId: string) => ['conversations', conversationId, 'messages'] as const,
  generationClaims: (generationId: string) => ['generations', generationId, 'claims'] as const,
  claimRecovery: (claimId: string) => ['claims', claimId, 'recovery'] as const,
};

export function useProjectConversations(projectId: string) {
  return useQuery({
    queryKey: conversationQueryKeys.projectList(projectId),
    queryFn: () => listConversations(projectId),
    enabled: Boolean(projectId),
    refetchOnWindowFocus: false,
  });
}

export function useConversationMessages(projectId: string, conversationId: string | null) {
  return useQuery({
    queryKey: conversationId ? conversationQueryKeys.messages(conversationId) : ['null_messages'],
    queryFn: () => (conversationId ? listMessages(projectId, conversationId) : Promise.resolve([])),
    enabled: Boolean(projectId && conversationId),
    refetchOnWindowFocus: false,
  });
}

export function useGenerationClaims(generationId?: string | null) {
  return useQuery({
    queryKey: generationId ? conversationQueryKeys.generationClaims(generationId) : ['null_claims'],
    queryFn: () => (generationId ? getGenerationClaims(generationId) : Promise.resolve([])),
    enabled: Boolean(generationId),
    refetchOnWindowFocus: false,
  });
}

export function useClaimRecoveryAttempts(claimId?: string | null) {
  return useQuery({
    queryKey: claimId ? conversationQueryKeys.claimRecovery(claimId) : ['null_recovery'],
    queryFn: () => (claimId ? getClaimRecoveryAttempts(claimId) : Promise.resolve([])),
    enabled: Boolean(claimId),
    refetchOnWindowFocus: false,
  });
}

export function useCreateConversation(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (title?: string) => createConversation(projectId, title),
    onSuccess: (newConv) => {
      queryClient.setQueryData<Conversation[]>(
        conversationQueryKeys.projectList(projectId),
        (old) => [newConv, ...(old || [])]
      );
    },
  });
}

export function useSendMessage(projectId: string, conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (content: string) => sendMessage(projectId, conversationId, content),
    onSuccess: (res) => {
      // Invalidate or update messages list
      queryClient.invalidateQueries({
        queryKey: conversationQueryKeys.messages(conversationId),
      });
      // Cache returned claims for this generation ID
      if (res.generationId && res.claims) {
        queryClient.setQueryData<Claim[]>(
          conversationQueryKeys.generationClaims(res.generationId),
          res.claims
        );
      }
    },
  });
}
