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

  // Active EventSource reference
  const esRef = React.useRef<EventSource | null>(null);

  // Store callbacks in ref to avoid re-triggering EventSource reconnection
  const callbacksRef = React.useRef({ onEvent, onClaimUpdate, onCompleted, onCancelled, onFailed });
  React.useEffect(() => {
    callbacksRef.current = { onEvent, onClaimUpdate, onCompleted, onCancelled, onFailed };
  });

  React.useEffect(() => {
    if (!enabled || !generationId || typeof window === 'undefined') {
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
        setIsStreaming(false);
      }
      return;
    }

    const token = getAuthToken();
    const cleanBase = API_BASE_URL.replace(/\/$/, '');
    const url = token
      ? `${cleanBase}/v1/generations/${generationId}/events?token=${encodeURIComponent(token)}`
      : `${cleanBase}/v1/generations/${generationId}/events`;

    let isClosed = false;
    const es = new EventSource(url);
    esRef.current = es;
    setIsStreaming(true);

    const handleEvent = (event: string, rawData: string) => {
      let data: any = {};
      try {
        data = rawData ? JSON.parse(rawData) : {};
      } catch {
        // fallback
      }

      const { state, label, isTerminal } = mapSSEEventToStatus(event, data);
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
          es.close();
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
          es.close();
          setIsStreaming(false);
        }
      }
    };

    // Standard SSE custom event listeners
    const knownEvents = [
      'generation.started',
      'token.delta',
      'sentence.verified',
      'sentence.flagged',
      'recovery.started',
      'recovery.completed',
      'generation.completed',
      'generation.failed',
    ];

    knownEvents.forEach((evtName) => {
      es.addEventListener(evtName, (e: MessageEvent) => {
        handleEvent(evtName, e.data);
      });
    });

    es.onerror = () => {
      // EventSource will automatically attempt to reconnect with Last-Event-ID.
      // If server closed stream (readyState === 2), stop streaming state.
      if (es.readyState === EventSource.CLOSED) {
        setIsStreaming(false);
      }
    };

    return () => {
      isClosed = true;
      es.close();
      esRef.current = null;
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
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
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
