import { EventEmitter } from 'events';
import { redisManager } from '../plugins/redis';

export interface GenerationEvent {
  id: number;
  event: string;
  data: Record<string, unknown>;
}

export const TERMINAL_EVENTS = new Set(['generation.completed', 'generation.failed']);
const BUFFER_TTL_MS = 5 * 60 * 1000;
const MAX_BUFFER_EVENTS = 100;
const REDIS_KEY_PREFIX = 'gg:events:';
const REDIS_CANCEL_PREFIX = 'gg:cancel:';
const REDIS_TTL_SEC = 300;

class GenerationEventBus {
  private emitter = new EventEmitter();
  private buffers = new Map<string, GenerationEvent[]>();
  private cancelledSet = new Set<string>();

  constructor() {
    this.emitter.setMaxListeners(0);
  }

  public publish(generationId: string, event: string, data: Record<string, unknown> = {}): void {
    const buffer = this.buffers.get(generationId) ?? [];
    const evt: GenerationEvent = { id: buffer.length + 1, event, data };
    buffer.push(evt);
    if (buffer.length > MAX_BUFFER_EVENTS) {
      buffer.shift();
    }
    this.buffers.set(generationId, buffer);
    this.emitter.emit(generationId, evt);

    // Ephemeral Redis publish & replay buffer (transient, best-effort)
    try {
      const client = redisManager.getClient();
      if (client && client.status === 'ready') {
        const payload = JSON.stringify(evt);
        client.rpush(`${REDIS_KEY_PREFIX}${generationId}`, payload).catch(() => {});
        client.expire(`${REDIS_KEY_PREFIX}${generationId}`, REDIS_TTL_SEC).catch(() => {});
        client.publish(`${REDIS_KEY_PREFIX}${generationId}`, payload).catch(() => {});
      }
    } catch {
      // Redis is optional runtime state; memory fallback continues
    }

    if (TERMINAL_EVENTS.has(event)) {
      const timer = setTimeout(() => {
        this.buffers.delete(generationId);
        this.cancelledSet.delete(generationId);
      }, BUFFER_TTL_MS);
      timer.unref();
    }
  }

  public history(generationId: string): GenerationEvent[] {
    return this.buffers.get(generationId) ?? [];
  }

  public isTerminal(generationId: string): boolean {
    return this.history(generationId).some((e) => TERMINAL_EVENTS.has(e.event));
  }

  public markCancelled(generationId: string): void {
    this.cancelledSet.add(generationId);
    try {
      const client = redisManager.getClient();
      if (client && client.status === 'ready') {
        client.set(`${REDIS_CANCEL_PREFIX}${generationId}`, '1', 'EX', REDIS_TTL_SEC).catch(() => {});
      }
    } catch {
      // Redis is optional runtime state
    }
  }

  public async isCancelled(generationId: string): Promise<boolean> {
    if (this.cancelledSet.has(generationId)) return true;
    try {
      const client = redisManager.getClient();
      if (client && client.status === 'ready') {
        const val = await client.get(`${REDIS_CANCEL_PREFIX}${generationId}`);
        if (val === '1') {
          this.cancelledSet.add(generationId);
          return true;
        }
      }
    } catch {
      // Fallback to local memory check
    }
    return false;
  }

  public subscribe(generationId: string, listener: (e: GenerationEvent) => void): () => void {
    this.emitter.on(generationId, listener);
    return () => this.emitter.off(generationId, listener);
  }
}

export const generationEvents = new GenerationEventBus();