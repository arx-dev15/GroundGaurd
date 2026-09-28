import type { Document, DocumentStatusResponse } from '@groundguard/types';
import { apiClient } from './api-client';

/**
 * M3 Documents API Service
 * 
 * Rules:
 * - Browser communicates ONLY with M3 API.
 * - Endpoint paths are verified against apps/api/src/routes/documents.ts.
 * - Single-file multipart uploads (max 10MB).
 */

export async function listDocuments(projectId: string): Promise<Document[]> {
  const res = await apiClient.get<{ documents: Document[] }>(`/v1/projects/${projectId}/documents`);
  return res.documents || [];
}

export async function getDocument(documentId: string): Promise<Document> {
  const res = await apiClient.get<{ document: Document }>(`/v1/documents/${documentId}`);
  return res.document;
}

export async function getDocumentStatus(documentId: string): Promise<DocumentStatusResponse> {
  return apiClient.get<DocumentStatusResponse>(`/v1/documents/${documentId}/status`);
}

export async function uploadDocument(projectId: string, file: File): Promise<Document> {
  const formData = new FormData();
  formData.append('file', file, file.name);

  const res = await apiClient.post<{ document: Document }>(
    `/v1/projects/${projectId}/documents`,
    formData
  );
  return res.document;
}

export async function deleteDocument(documentId: string): Promise<void> {
  await apiClient.delete<{ message: string }>(`/v1/documents/${documentId}`);
}
