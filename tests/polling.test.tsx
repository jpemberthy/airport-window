// @vitest-environment jsdom
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { act, renderHook, cleanup } from '@testing-library/react';
import { useLiveFeed } from '../lib/use-live-feed';
import { normalizeTraffic, unavailableTraffic } from '../lib/normalize';
beforeEach(() => {
  vi.useFakeTimers();
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    value: false,
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe('polling lifecycle', () => {
  it('pauses while hidden and immediately refreshes on resume without duplicates', async () => {
    const fetcher = vi
      .fn()
      .mockImplementation(
        async () =>
          new Response(
            JSON.stringify(normalizeTraffic({ now: Date.now(), ac: [] })),
          ),
      );
    vi.stubGlobal('fetch', fetcher);
    const callback = vi.fn();
    renderHook(() =>
      useLiveFeed('/api/traffic', 5000, unavailableTraffic('', 0), callback),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, 'hidden', { value: true });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, 'hidden', { value: false });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(callback).toHaveBeenCalledTimes(3);
  });
  it('keeps last data on a network failure and respects server retry delays', async () => {
    const good = normalizeTraffic({ now: Date.now(), ac: [] });
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(good)))
      .mockRejectedValueOnce(new Error('Offline'))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ...good,
            freshness: 'stale',
            error: 'Busy',
            retryAfterSeconds: 60,
          }),
        ),
      );
    vi.stubGlobal('fetch', fetcher);
    const { result } = renderHook(() =>
      useLiveFeed('/api/traffic', 5000, unavailableTraffic('', 0)),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(result.current.freshness).toBe('stale');
    expect(result.current.observedAt).toBe(good.observedAt);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(59_000);
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it('aborts in-flight work when unmounted', async () => {
    let signal: AbortSignal | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, options: RequestInit) => {
        signal = options.signal as AbortSignal;
        return new Promise(() => {});
      }),
    );
    const { unmount } = renderHook(() =>
      useLiveFeed('/api/traffic', 5000, unavailableTraffic('', 0)),
    );
    unmount();
    expect(signal?.aborted).toBe(true);
  });
});
