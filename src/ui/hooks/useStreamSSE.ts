'use client';

import { useState, useEffect, useRef } from 'react';

export type StreamEarned = {
  earnedMinor: string;
  netEarnedMinor: string;
  earnedUsdc: string;
  netEarnedUsdc: string;
  elapsedSeconds: number;
  percentComplete: number;
};

export type StreamSSEState = {
  earned: StreamEarned | null;
  status: string | null;
  connected: boolean;
  serverTime: string | null;
};

export function useStreamSSE(streamId: string | null) {
  const [state, setState] = useState<StreamSSEState>({
    earned: null,
    status: null,
    connected: false,
    serverTime: null,
  });
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!streamId) return;

    const es = new EventSource(`/api/streams/${streamId}/sse`);
    esRef.current = es;

    es.onopen = () => setState((s) => ({ ...s, connected: true }));
    es.onerror = () => setState((s) => ({ ...s, connected: false }));

    es.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data) as {
          type: string;
          earned?: StreamEarned;
          status?: string;
          serverTime?: string;
        };
        if (data.type === 'snapshot' || data.type === 'tick') {
          setState((s) => ({
            ...s,
            earned: data.earned ?? s.earned,
            status: data.status ?? s.status,
            serverTime: data.serverTime ?? s.serverTime,
          }));
        } else if (data.type === 'stream.updated') {
          setState((s) => ({ ...s, status: data.status ?? s.status }));
        }
      } catch {
        // ignore parse errors
      }
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [streamId]);

  return state;
}
