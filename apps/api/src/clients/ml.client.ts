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
}

export const mlClient = new MLClient();
