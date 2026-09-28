import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Document } from '@groundguard/types';
import {
  listDocuments,
  getDocument,
  uploadDocument,
  deleteDocument,
} from './documents-api';

export const documentQueryKeys = {
  all: ['documents'] as const,
  projectList: (projectId: string) => ['projects', projectId, 'documents'] as const,
  detail: (documentId: string) => ['documents', documentId] as const,
};

/**
 * Hook to retrieve documents for a project with conditional polling:
 * Automatically polls every 3 seconds only while any document is in 'processing' or 'uploaded' state.
 * Ceases polling when all documents have settled into terminal states ('ready' | 'failed').
 */
export function useProjectDocuments(projectId: string) {
  return useQuery({
    queryKey: documentQueryKeys.projectList(projectId),
    queryFn: () => listDocuments(projectId),
    enabled: Boolean(projectId),
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data || data.length === 0) return false;
      const hasActiveIngestion = data.some(
        (doc) => doc.status === 'processing' || doc.status === 'uploaded'
      );
      return hasActiveIngestion ? 3000 : false;
    },
    refetchOnWindowFocus: false,
  });
}

/**
 * Hook to retrieve a single document by ID with conditional polling if active.
 */
export function useDocument(documentId: string) {
  return useQuery({
    queryKey: documentQueryKeys.detail(documentId),
    queryFn: () => getDocument(documentId),
    enabled: Boolean(documentId),
    refetchInterval: (query) => {
      const doc = query.state.data;
      if (!doc) return false;
      return doc.status === 'processing' || doc.status === 'uploaded' ? 3000 : false;
    },
    refetchOnWindowFocus: false,
  });
}

/**
 * Hook to upload a single document to a project.
 */
export function useUploadDocument(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (file: File) => uploadDocument(projectId, file),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: documentQueryKeys.projectList(projectId),
      });
    },
  });
}

/**
 * Hook to delete a document by ID.
 */
export function useDeleteDocument(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (documentId: string) => deleteDocument(documentId),
    onSuccess: (_, documentId) => {
      queryClient.invalidateQueries({
        queryKey: documentQueryKeys.projectList(projectId),
      });
      queryClient.removeQueries({
        queryKey: documentQueryKeys.detail(documentId),
      });
    },
  });
}
