import { config } from '../config/env';
import { VerifyRequest, VerifyResponse } from '@groundguard/contracts';
import { ServiceUnavailableError } from '../utils/errors';

export class MLClient {
  private baseUrl: string;
  private timeoutMs: number;

  constructor(baseUrl: string = config.mlServiceUrl, timeoutMs: number = 5000) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.timeoutMs = timeoutMs;
  }

  private async fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(id);
      return response;
    } catch (err: any) {
      clearTimeout(id);
      throw new ServiceUnavailableError('ML Service');
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

  public async health(): Promise<{ service: string; status: string; modelLoaded: boolean; modelVersion: string; device: string }> {
    const res = await this.fetchWithTimeout(`${this.baseUrl}/health`);
    if (!res.ok) {
      throw new ServiceUnavailableError('ML Service (/health)');
    }
    return res.json();
  }

  public async modelInfo(): Promise<{ modelVersion: string; engineType: string; baseModel: string; labels: string[]; status: string }> {
    const res = await this.fetchWithTimeout(`${this.baseUrl}/model/info`);
    if (!res.ok) {
      throw new ServiceUnavailableError('ML Service (/model/info)');
    }
    return res.json();
  }

  public async verify(payload: VerifyRequest, requestId?: string): Promise<VerifyResponse> {
    const reqId = payload.requestId || requestId;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (reqId) headers['x-request-id'] = reqId;

    const res = await this.fetchWithTimeout(`${this.baseUrl}/verify`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...payload, requestId: reqId }),
    });

    if (!res.ok) {
      throw new ServiceUnavailableError('ML Service (/verify)');
    }
    return res.json();
  }

  public async verifyBatch(
    payload: {
      requestId?: string;
      items: Array<{
        claimId: string;
        claim: string;
        evidence: Array<{ chunkId: string; text: string }>;
      }>;
    },
    requestId?: string
  ): Promise<{
    requestId: string;
    results: Array<{
      claimId: string;
      label: 'entailment' | 'contradiction' | 'neutral';
      scores: {
        entailment: number;
        contradiction: number;
        neutral: number;
      };
      groundingScore: number;
    }>;
    modelVersion: string;
  }> {
    const reqId = payload.requestId || requestId;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (reqId) headers['x-request-id'] = reqId;

    const res = await this.fetchWithTimeout(`${this.baseUrl}/verify/batch`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...payload, requestId: reqId }),
    });

    if (!res.ok) {
      throw new ServiceUnavailableError('ML Service (/verify/batch)');
    }
    return res.json();
  }
}

export const mlClient = new MLClient();
