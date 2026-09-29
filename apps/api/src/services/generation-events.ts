import { EventEmitter } from 'events';

export interface GenerationEvent {
  id: number;
  event: string;
  data: Record<string, unknown>;
}

const TERMINAL_EVENTS = new Set(['generation.completed', 'generation.failed', 'generation.cancelled']);
const BUFFER_TTL_MS = 5 * 60 * 1000;

class GenerationEventBus {
  private emitter = new EventEmitter();
  private buffers = new Map<string, GenerationEvent[]>();

  constructor() {
    this.emitter.setMaxListeners(0);
  }

  public publish(generationId: string, event: string, data: Record<string, unknown> = {}): void {
    const buffer = this.buffers.get(generationId) ?? [];
    const evt: GenerationEvent = { id: buffer.length + 1, event, data };
    buffer.push(evt);
    this.buffers.set(generationId, buffer);
    this.emitter.emit(generationId, evt);

    if (TERMINAL_EVENTS.has(event)) {
      const timer = setTimeout(() => this.buffers.delete(generationId), BUFFER_TTL_MS);
      timer.unref();
    }
  }

  public history(generationId: string): GenerationEvent[] {
    return this.buffers.get(generationId) ?? [];
  }

  public isTerminal(generationId: string): boolean {
    return this.history(generationId).some((e) => TERMINAL_EVENTS.has(e.event));
  }

  public subscribe(generationId: string, listener: (e: GenerationEvent) => void): () => void {
    this.emitter.on(generationId, listener);
    return () => this.emitter.off(generationId, listener);
  }
}

export const generationEvents = new GenerationEventBus();