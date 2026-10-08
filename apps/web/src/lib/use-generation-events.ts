'use client';

import * as React from 'react';
import { API_BASE_URL, getAuthToken, apiClient } from './api-client';
import { mapSSEEventToStatus } from './trust-utils';
import { normalizeClaimEvent, type ClaimUpdate } from './claim-events';
import type { Claim, GenerationStatus } from '@groundguard/types';

export interface UseGenerationEventsOptions {
  generationId?: string | null;
  onEvent?: (event: string, data: any) => void;
  onAnswerDelta?: (data: { delta: string; sequence: number }) => void;
  onClaimUpdate?: (claim: ClaimUpdate) => void;
  onCompleted?: (data: { generationId: string; answer?: string }) => void;
  onCancelled?: () => void;
  onFailed?: (error: { code?: string; message?: string }) => void;
  enabled?: boolean;
}

export interface UseGenerationEventsReturn {
  status: GenerationStatus;
  statusLabel: string;
  isStreaming: boolean;
  cancel: () => Promise<void>;
  isCancelling: boolean;
}

export function useGenerationEvents({
  generationId,
  onEvent,
  onAnswerDelta,
  onClaimUpdate,
  onCompleted,
  onCancelled,
  onFailed,
  enabled = true,
}: UseGenerationEventsOptions): UseGenerationEventsReturn {
  const [status, setStatus] = React.useState<GenerationStatus>('generating');
  const [statusLabel, setStatusLabel] = React.useState<string>('Preparing answer...');
  const [isStreaming, setIsStreaming] = React.useState<boolean>(false);
  const [isCancelling, setIsCancelling] = React.useState<boolean>(false);

  // Active stream controller reference
  const abortControllerRef = React.useRef<AbortController | null>(null);
  const lastEventIdRef = React.useRef<string | null>(null);

  const maxSequenceRef = React.useRef<number>(0);

  // Store callbacks in ref to avoid re-triggering reconnection
  const callbacksRef = React.useRef({ onEvent, onAnswerDelta, onClaimUpdate, onCompleted, onCancelled, onFailed });
  React.useEffect(() => {
    callbacksRef.current = { onEvent, onAnswerDelta, onClaimUpdate, onCompleted, onCancelled, onFailed };
  });

  React.useEffect(() => {
    if (!enabled || !generationId || typeof window === 'undefined') {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
        setIsStreaming(false);
      }
      return;
    }

    maxSequenceRef.current = 0;
    let isClosed = false;
    let sawTerminal = false;
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsStreaming(true);

    const handleEvent = (event: string, rawData: string) => {
      // Ignore anything still buffered from a stream that was superseded or cancelled: callbacks are
      // shared (ref) with the CURRENT request, so stale deltas/claims would leak into a new answer.
      if (isClosed || controller.signal.aborted) return;
      let data: any = {};
      try {
        data = rawData ? JSON.parse(rawData) : {};
      } catch {
        // fallback
      }

      const { state, label } = mapSSEEventToStatus(event, data);
      setStatus(state);
      setStatusLabel(label);

      callbacksRef.current.onEvent?.(event, data);

      if (event === 'answer.delta') {
        const seq = typeof data?.sequence === 'number' ? data.sequence : maxSequenceRef.current + 1;
        // Strictly prevent duplicate text when replaying SSE events on reconnect
        if (seq > maxSequenceRef.current) {
          maxSequenceRef.current = seq;
          if (data?.delta) {
            callbacksRef.current.onAnswerDelta?.({ delta: data.delta, sequence: seq });
          }
        }
      }

      if (event === 'sentence.verified' || event === 'sentence.flagged' || event === 'recovery.completed') {
        // M3 sends flat { claimId, text, status, label, groundingScore }; nested { claim } is also accepted.
        const update = normalizeClaimEvent(data);
        if (update) {
          callbacksRef.current.onClaimUpdate?.(update);
        }
      }

      if (event === 'generation.completed' || event === 'generation.failed') {
        sawTerminal = true;
      }
      if (event === 'generation.completed') {
        callbacksRef.current.onCompleted?.(data);
        if (!isClosed) {
          controller.abort();
          setIsStreaming(false);
        }
      } else if (event === 'generation.failed') {
        if (data?.code === 'GENERATION_CANCELLED') {
          setStatus('cancelled');
          setStatusLabel('Generation cancelled');
          callbacksRef.current.onCancelled?.();
        } else {
          callbacksRef.current.onFailed?.(data);
        }
        if (!isClosed) {
          controller.abort();
          setIsStreaming(false);
        }
      }
    };

    async function streamEvents() {
      const token = getAuthToken();
      const cleanBase = API_BASE_URL.replace(/\/$/, '');
      const url = `${cleanBase}/v1/generations/${generationId}/events`;

      const headers: Record<string, string> = {
        Accept: 'text/event-stream',
      };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      if (lastEventIdRef.current) {
        headers['Last-Event-ID'] = lastEventIdRef.current;
      }

      try {
        const response = await fetch(url, {
          headers,
          signal: controller.signal,
        });

        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            callbacksRef.current.onFailed?.({ code: 'UNAUTHORIZED', message: 'Authentication required' });
          } else if (response.status === 404) {
            callbacksRef.current.onFailed?.({ code: 'NOT_FOUND', message: 'Generation not found' });
          } else {
            callbacksRef.current.onFailed?.({ code: 'STREAM_ERROR', message: `HTTP ${response.status}` });
          }
          if (!isClosed) {
            setIsStreaming(false);
          }
          return;
        }

        if (!response.body) {
          if (!isClosed) {
            setIsStreaming(false);
          }
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (!isClosed && !controller.signal.aborted) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const blocks = buffer.split('\n\n');
          buffer = blocks.pop() || '';

          for (const block of blocks) {
            if (!block.trim()) continue;
            let eventType = 'message';
            let eventId: string | null = null;
            const dataLines: string[] = [];

            for (const rawLine of block.split('\n')) {
              const line = rawLine.trimEnd();
              if (line.startsWith('event:')) {
                eventType = line.slice(6).trim();
              } else if (line.startsWith('data:')) {
                dataLines.push(line.slice(5).trim());
              } else if (line.startsWith('id:')) {
                eventId = line.slice(3).trim();
              }
            }

            if (eventId) {
              lastEventIdRef.current = eventId;
            }

            const rawData = dataLines.join('\n');
            handleEvent(eventType, rawData);
          }
        }
      } catch (err: any) {
        if (err.name === 'AbortError' || controller.signal.aborted) {
          return;
        }
        console.warn('Generation events stream error:', err);
      } finally {
        if (!isClosed && !controller.signal.aborted) {
          setIsStreaming(false);
          if (!sawTerminal) {
            // The live stream ended without a terminal event (network drop / proxy timeout). Resolve from
            // the generation's persisted status instead of leaving the UI in an indefinite loading state.
            try {
              const g = await apiClient.get<{ status?: string; answer?: string }>(`/v1/generations/${generationId}`);
              if (isClosed) return;
              if (g?.status === 'completed') {
                callbacksRef.current.onCompleted?.({ generationId: generationId as string, answer: g.answer });
              } else if (g?.status === 'cancelled') {
                setStatus('cancelled');
                setStatusLabel('Generation cancelled');
                callbacksRef.current.onCancelled?.();
              } else {
                callbacksRef.current.onFailed?.({
                  code: g?.status === 'failed' ? 'GENERATION_FAILED' : 'STREAM_INTERRUPTED',
                  message: g?.status === 'failed'
                    ? "We couldn't generate this answer."
                    : 'Live updates were interrupted. Refresh to load the final verified answer.',
                });
              }
            } catch {
              if (!isClosed) {
                callbacksRef.current.onFailed?.({ code: 'STREAM_INTERRUPTED', message: 'Live updates were interrupted. Refresh to load the final verified answer.' });
              }
            }
          }
        }
      }
    }

    streamEvents();

    return () => {
      isClosed = true;
      controller.abort();
      abortControllerRef.current = null;
      setIsStreaming(false);
    };
  }, [generationId, enabled]);

  // Cancel generation action
  const cancel = React.useCallback(async () => {
    if (!generationId || isCancelling) return;
    setIsCancelling(true);
    try {
      await apiClient.post(`/v1/generations/${generationId}/cancel`);
      setStatus('cancelled');
      setStatusLabel('Generation cancelled');
      onCancelled?.();
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      setIsStreaming(false);
    } catch (err: any) {
      // If already cancelled or completed, reconcile state
      console.warn('Cancel generation notification:', err.message);
    } finally {
      setIsCancelling(false);
    }
  }, [generationId, isCancelling, onCancelled]);

  return {
    status,
    statusLabel,
    isStreaming,
    cancel,
    isCancelling,
  };
}
