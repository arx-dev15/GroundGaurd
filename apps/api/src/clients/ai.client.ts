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
import { BadRequestError, ServiceUnavailableError } from '../utils/errors';

export class AIClient {
  private baseUrl: string;
  private timeoutMs: number;

  constructor(baseUrl: string = config.aiServiceUrl, timeoutMs: number = 5000) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.timeoutMs = timeoutMs;
  }

  private async fetchWithTimeout(
    url: string,
    options: RequestInit = {},
    customTimeoutMs?: number,
    externalSignal?: AbortSignal
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = customTimeoutMs || this.timeoutMs;
    const id = setTimeout(() => controller.abort(), timeout);

    const onAbort = () => {
      controller.abort();
    };

    if (externalSignal) {
      if (externalSignal.aborted) {
        controller.abort();
      } else {
        externalSignal.addEventListener('abort', onAbort, { once: true });
      }
    }

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(id);
      if (externalSignal) {
        externalSignal.removeEventListener('abort', onAbort);
      }
      return response;
    } catch (err: any) {
      clearTimeout(id);
      if (externalSignal) {
        externalSignal.removeEventListener('abort', onAbort);
      }
      if (externalSignal?.aborted || err?.name === 'AbortError') {
        const cancelErr = new Error('Request was aborted by user');
        (cancelErr as any).name = 'AbortError';
        throw cancelErr;
      }
      throw new ServiceUnavailableError('AI Service');
    }
  }

  public async checkHealth(): Promise<{
    ok: boolean;
    status?: string;
    retrievalMode?: string;
    degradationReason?: string;
    error?: string;
  }> {
    try {
      const res = await this.fetchWithTimeout(`${this.baseUrl}/health`);
      if (res.ok) {
        const data = await res.json();
        return {
          ok: true,
          status: data.status,
          retrievalMode: data.retrievalMode,
          degradationReason: data.degradationReason ?? undefined,
        };
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

    if (res.status === 400 || res.status === 422) {
      // Invalid/unreadable upload: the AI service returns a sanitized validation message.
      let detail = 'Uploaded PDF could not be processed';
      try {
        const body: any = await res.json();
        if (typeof body?.detail === 'string') detail = body.detail;
      } catch {
        /* keep default */
      }
      throw new BadRequestError(detail);
    }
    if (!res.ok) {
      throw new ServiceUnavailableError('AI Service (/ingest)');
    }
    return res.json();
  }

  public async verifyIndex(
    documentId: string,
    projectId: string,
    expectedCount?: number,
    requestId?: string
  ): Promise<{ consistent: boolean; documentId: string; projectId: string; qdrantCount: number; tantivyCount: number; expectedCount?: number }> {
    const headers: Record<string, string> = {};
    if (requestId) headers['x-request-id'] = requestId;

    const url = new URL(`${this.baseUrl}/documents/${documentId}/verify-index`);
    url.searchParams.append('projectId', projectId);
    if (expectedCount !== undefined) {
      url.searchParams.append('expectedCount', String(expectedCount));
    }

    const res = await this.fetchWithTimeout(url.toString(), {
      method: 'GET',
      headers,
    });

    if (!res.ok) {
      throw new ServiceUnavailableError('AI Service (/verify-index)');
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

   public async generate(
    payload: GenerationRequest & { projectId: string; requestId?: string; generationId?: string },
    requestId?: string,
    signal?: AbortSignal
  ): Promise<GenerationResult> {
    const reqId = payload.requestId || requestId;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (reqId) headers['x-request-id'] = reqId;

    const GENERATE_TIMEOUT_MS = 90_000; // real LLM calls run far longer than ingest

    const res = await this.fetchWithTimeout(
      `${this.baseUrl}/generate`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...payload, requestId: reqId }),
      },
      GENERATE_TIMEOUT_MS,
      signal
    );

    if (!res.ok) {
      throw new ServiceUnavailableError('AI Service (/generate)');
    }
    return res.json();
  }

  public async generateStream(
    payload: GenerationRequest & { projectId: string; requestId?: string; generationId?: string },
    onEvent: (event: string, data: any) => void,
    requestId?: string,
    signal?: AbortSignal
  ): Promise<GenerationResult> {
    const reqId = payload.requestId || requestId;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    };
    if (reqId) headers['x-request-id'] = reqId;

    const STREAM_TIMEOUT_MS = 120_000;
    const res = await this.fetchWithTimeout(
      `${this.baseUrl}/generate/stream`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...payload, requestId: reqId }),
      },
      STREAM_TIMEOUT_MS,
      signal
    );

    if (!res.ok) {
      throw new ServiceUnavailableError('AI Service (/generate/stream)');
    }

    if (!res.body) {
      throw new ServiceUnavailableError('AI Service (/generate/stream): empty stream body');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finalResult: GenerationResult | null = null;

    while (true) {
      if (signal?.aborted) {
        reader.cancel().catch(() => {});
        const err = new Error('Request was aborted by user');
        (err as any).name = 'AbortError';
        throw err;
      }

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split('\n\n');
      buffer = blocks.pop() || '';

      for (const block of blocks) {
        if (!block.trim()) continue;
        let eventType = 'message';
        let dataStr = '';

        for (const rawLine of block.split('\n')) {
          const line = rawLine.trim();
          if (line.startsWith('event:')) {
            eventType = line.slice(6).trim();
          } else if (line.startsWith('data:')) {
            dataStr = line.slice(5).trim();
          }
        }

        if (dataStr) {
          try {
            const data = JSON.parse(dataStr);
            onEvent(eventType, data);
            if (eventType === 'generation.completed') {
              finalResult = data as GenerationResult;
            } else if (eventType === 'generation.failed') {
              finalResult = {
                requestId: reqId || '',
                generationId: payload.generationId || '',
                status: 'failed',
                answer: '',
                evidence: [],
                error: data,
                claims: [],
              };
            }
          } catch (_) {
            // Ignore malformed chunks
          }
        }
      }
    }

    if (!finalResult) {
      throw new ServiceUnavailableError('AI Service (/generate/stream): stream ended without terminal event');
    }

    return finalResult;
  }

  public async recover(payload: RecoverRequest, requestId?: string, signal?: AbortSignal): Promise<RecoverResponse> {
    const reqId = payload.requestId || requestId;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (reqId) headers['x-request-id'] = reqId;

    const res = await this.fetchWithTimeout(
      `${this.baseUrl}/recover`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...payload, requestId: reqId }),
      },
      60000, // 60s timeout for recovery retrieval and LLM call
      signal
    );

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
