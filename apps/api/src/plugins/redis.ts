import Redis from 'ioredis';
import { config } from '../config/env';

export class RedisManager {
  private static instance: RedisManager;
  private client: Redis | null = null;

  private constructor() {}

  public static getInstance(): RedisManager {
    if (!RedisManager.instance) {
      RedisManager.instance = new RedisManager();
    }
    return RedisManager.instance;
  }

  public getClient(): Redis {
    if (!this.client) {
      this.client = new Redis(config.redisUrl, {
        maxRetriesPerRequest: 1,
        connectTimeout: 2000,
        retryStrategy(times) {
          if (times > 2) return null; // stop retrying quickly if unreachable
          return Math.min(times * 200, 1000);
        },
        lazyConnect: true,
      });

      // Suppress unhandled error log spam when redis server is offline
      this.client.on('error', () => {
        // Handled silently by health check
      });
    }
    return this.client;
  }

  public async checkHealth(): Promise<{ ok: boolean; error?: string }> {
    try {
      if (this.client && this.client.status !== 'ready' && this.client.status !== 'connect') {
        try {
          this.client.disconnect();
        } catch (_) {}
        this.client = null;
      }
      const client = this.getClient();
      if (client.status === 'wait') {
        await client.connect();
      }
      const pong = await client.ping();
      if (pong === 'PONG') {
        return { ok: true };
      }
      return { ok: false, error: `Redis ping returned ${pong}` };
    } catch (err: any) {
      if (this.client) {
        try {
          this.client.disconnect();
        } catch (_) {}
        this.client = null;
      }
      return { ok: false, error: err.message || 'Redis connection failed' };
    }
  }

  public async close(): Promise<void> {
    if (this.client) {
      try {
        await this.client.quit();
      } catch (_) {
        this.client.disconnect();
      }
      this.client = null;
    }
  }
}

export const redisManager = RedisManager.getInstance();
