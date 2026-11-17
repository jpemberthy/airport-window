import { describe, it, expect, vi } from 'vitest';
import { createFeedCache, parseRetryAfter } from '../lib/feed-cache';
import { normalizeTraffic, unavailableTraffic } from '../lib/normalize';
const start = Date.parse('2026-09-07T18:00:00Z');
function setup() {
  let now = start;
  const fetcher = vi.fn<typeof fetch>();
  const get = createFeedCache({
    url: 'https://example.test/fixed-logan',
    ttl: 5000,
    staleAfter: 30_000,
    normalize: normalizeTraffic,
    unavailable: unavailableTraffic,
    fetcher,
    clock: () => now,
  });
  return {
    fetcher,
    get,
    advance: (ms: number) => {
      now += ms;
    },
    good: () => new Response(JSON.stringify({ now, ac: [] })),
  };
}
describe('upstream cache and outage recovery', () => {
  it('coalesces concurrent requests and reuses five-second cache', async () => {
    const s = setup();
    s.fetcher.mockResolvedValue(s.good());
    await Promise.all([s.get(), s.get(), s.get()]);
    expect(s.fetcher).toHaveBeenCalledTimes(1);
    s.advance(4999);
    await s.get();
    expect(s.fetcher).toHaveBeenCalledTimes(1);
    s.advance(2);
    await s.get();
    expect(s.fetcher).toHaveBeenCalledTimes(2);
  });
  it('obeys 429 retry delays and recovers', async () => {
    const s = setup();
    s.fetcher
      .mockResolvedValueOnce(
        new Response('', { status: 429, headers: { 'Retry-After': '45' } }),
      )
      .mockImplementation(async () => s.good());
    expect(await s.get()).toMatchObject({
      freshness: 'unavailable',
      retryAfterSeconds: 45,
    });
    s.advance(44_000);
    await s.get();
    expect(s.fetcher).toHaveBeenCalledTimes(1);
    s.advance(1001);
    expect(await s.get()).toMatchObject({ freshness: 'fresh', error: null });
  });
  it('keeps last good data during timeout and retries independently', async () => {
    const s = setup();
    s.fetcher
      .mockResolvedValueOnce(s.good())
      .mockRejectedValueOnce(new DOMException('Timed out', 'TimeoutError'))
      .mockImplementation(async () => s.good());
    await s.get();
    s.advance(5001);
    expect(await s.get()).toMatchObject({
      freshness: 'stale',
      error: 'Feed request timed out',
      aircraft: [],
    });
    s.advance(15_001);
    expect(await s.get()).toMatchObject({ freshness: 'fresh', error: null });
  });
  it('handles 204 and malformed upstream payloads without replacing good data', async () => {
    const s = setup();
    s.fetcher
      .mockResolvedValueOnce(s.good())
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response('not json'));
    await s.get();
    s.advance(5001);
    expect((await s.get()).freshness).toBe('stale');
    s.advance(15_001);
    expect((await s.get()).observedAt).toBe(start);
  });
  it('parses server-date Retry-After and handles invalid values', () => {
    expect(parseRetryAfter(new Date(start + 90_000).toUTCString(), start)).toBe(
      90,
    );
    expect(parseRetryAfter('oops', start)).toBe(15);
    expect(parseRetryAfter('-1', start)).toBe(1);
  });
  it('passes a bounded AbortSignal to the fixed URL', async () => {
    const s = setup();
    s.fetcher.mockResolvedValue(s.good());
    await s.get();
    expect(s.fetcher.mock.calls[0][0]).toBe('https://example.test/fixed-logan');
    expect(s.fetcher.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  });
});
