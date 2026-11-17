'use client';
import { useEffect, useRef, useState } from 'react';
import type { FeedStatus } from './types';
export function useLiveFeed<T extends FeedStatus>(
  endpoint: string,
  interval: number,
  initial: T,
  onSnapshot?: (data: T) => void,
) {
  const [data, setData] = useState<T>(initial);
  const callback = useRef(onSnapshot);
  useEffect(() => {
    callback.current = onSnapshot;
  }, [onSnapshot]);
  useEffect(() => {
    let disposed = false,
      timer: ReturnType<typeof setTimeout> | undefined,
      controller: AbortController | undefined,
      generation = 0;
    async function poll() {
      if (disposed || document.hidden) return;
      const id = ++generation;
      controller = new AbortController();
      const request = controller;
      const timeout = setTimeout(() => request.abort(), 12_000);
      let delay = interval;
      try {
        const response = await fetch(endpoint, {
          signal: request.signal,
          cache: 'no-store',
        });
        const result = (await response.json()) as T;
        if (
          !result ||
          !['fresh', 'stale', 'unavailable'].includes(result.freshness)
        )
          throw new Error('Invalid feed response');
        if (disposed || id !== generation) return;
        setData(result);
        callback.current?.(result);
        if (result.error || !response.ok)
          delay = Math.max(15_000, (result.retryAfterSeconds ?? 15) * 1000);
      } catch {
        if (disposed || id !== generation) return;
        setData((previous) => ({
          ...previous,
          freshness: previous.receivedAt ? 'stale' : 'unavailable',
          error: 'Connection interrupted. Reconnecting…',
          retryAfterSeconds: 15,
        }));
        delay = 15_000;
      } finally {
        clearTimeout(timeout);
        if (!disposed && id === generation && !document.hidden)
          timer = setTimeout(poll, delay);
      }
    }
    function visibility() {
      generation++;
      clearTimeout(timer);
      controller?.abort();
      if (!document.hidden) void poll();
    }
    document.addEventListener('visibilitychange', visibility);
    void poll();
    return () => {
      disposed = true;
      generation++;
      clearTimeout(timer);
      controller?.abort();
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [endpoint, interval]);
  return data;
}
