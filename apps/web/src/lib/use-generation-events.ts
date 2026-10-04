'use client';

import * as React from 'react';
import { API_BASE_URL, getAuthToken, apiClient } from './api-client';
import { mapSSEEventToStatus } from './trust-utils';
import type { Claim, GenerationStatus } from '@groundguard/types';

export interface UseGenerationEventsOptions {
  generationId?: string | null;
  onEvent?: (event: string, data: any) => void;
  onClaimUpdate?: (claim: Claim) => void;
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

  // Store callbacks in ref to avoid re-triggering reconnection
  const callbacksRef = React.useRef({ onEvent, onClaimUpdate, onCompleted, onCancelled, onFailed });
  React.useEffect(() => {
    callbacksRef.current = { onEvent, onClaimUpdate, onCompleted, onCancelled, onFailed };
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

    let isClosed = false;
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsStreaming(true);

    const handleEvent = (event: string, rawData: string) => {
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

      if (event === 'sentence.verified' || event === 'sentence.flagged' || event === 'recovery.completed') {
        if (data?.claim) {
          callbacksRef.current.onClaimUpdate?.(data.claim);
        }
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
