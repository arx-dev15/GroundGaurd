import { config } from '../config/env';
import {
  IngestRequest,
  IngestResponse,
  RetrieveRequest,
  RetrieveResult,
  GenerationRequest,
  GenerationResult,
  RecoverRequest,
  RecoverResponse,
  DeleteDocumentResponse,
} from '@groundguard/contracts';
import { ServiceUnavailableError } from '../utils/errors';

export class AIClient {
  private baseUrl: string;
  private timeoutMs: number;

  constructor(baseUrl: string = config.aiServiceUrl, timeoutMs: number = 5000) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.timeoutMs = timeoutMs;
  }

  private async fetchWithTimeout(url: string, options: RequestInit = {}, customTimeoutMs?: number): Promise<Response> {
    const controller = new AbortController();
    const timeout = customTimeoutMs || this.timeoutMs;
    const id = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(id);
      return response;
    } catch (err: any) {
      clearTimeout(id);
      throw new ServiceUnavailableError('AI Service');
    }
  }

  public async checkHealth(): Promise<{ ok: boolean; status?: string; error?: string }> {
    try {
      const res = await this.fetchWithTimeout(`${this.baseUrl}/health`);
      if (res.ok) {
        const data = await res.json();
        return { ok: true, status: data.status };
      }
      return { ok: false, error: `HTTP ${res.status}` };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  }

  public async ingest(
    documentId: string,
    projectId: string,
    fileBuffer: Buffer,
    filename: string,
    requestId?: string
  ): Promise<IngestResponse> {
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(fileBuffer)], { type: 'application/pdf' });
    formData.append('file', blob, filename);
    formData.append('documentId', documentId);
    formData.append('projectId', projectId);

    const headers: Record<string, string> = {};
    if (requestId) headers['x-request-id'] = requestId;

    const res = await this.fetchWithTimeout(
      `${this.baseUrl}/ingest`,
      {
        method: 'POST',
        headers,
        body: formData,
      },
      60000 // 60s timeout for real PDF parsing and embedding
    );

    if (!res.ok) {
      throw new ServiceUnavailableError('AI Service (/ingest)');
    }
    return res.json();
  }

  public async retrieve(payload: RetrieveRequest, requestId?: string): Promise<RetrieveResult> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (requestId) headers['x-request-id'] = requestId;

    const res = await this.fetchWithTimeout(`${this.baseUrl}/retrieve`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new ServiceUnavailableError('AI Service (/retrieve)');
    }
    return res.json();
  }

  public async generate(payload: GenerationRequest & { projectId: string; requestId?: string; generationId?: string }, requestId?: string): Promise<GenerationResult> {
    const reqId = payload.requestId || requestId;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (reqId) headers['x-request-id'] = reqId;

    const res = await this.fetchWithTimeout(`${this.baseUrl}/generate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...payload, requestId: reqId }),
    });

    if (!res.ok) {
      throw new ServiceUnavailableError('AI Service (/generate)');
    }
    return res.json();
  }

  public async recover(payload: RecoverRequest, requestId?: string): Promise<RecoverResponse> {
    const reqId = payload.requestId || requestId;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (reqId) headers['x-request-id'] = reqId;

    const res = await this.fetchWithTimeout(`${this.baseUrl}/recover`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...payload, requestId: reqId }),
    });

    if (!res.ok) {
      throw new ServiceUnavailableError('AI Service (/recover)');
    }
    return res.json();
  }

  public async deleteDocument(
    documentId: string,
    projectId: string,
    requestId?: string
  ): Promise<DeleteDocumentResponse> {
    const headers: Record<string, string> = {};
    if (requestId) headers['x-request-id'] = requestId;

    const query = new URLSearchParams({ projectId }).toString();
    const res = await this.fetchWithTimeout(`${this.baseUrl}/documents/${documentId}?${query}`, {
      method: 'DELETE',
      headers,
    });

    if (!res.ok) {
      throw new ServiceUnavailableError('AI Service (/documents/delete)');
    }
    return res.json();
  }
}

export const aiClient = new AIClient();
