// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ACTIVITY_INTERVAL_MS,
  activityInterludeAvailable,
  presentationPhase,
  STORY_INTERVAL_MS,
  usePresentationCycle,
  useActivityInterlude,
  usePresentationController,
} from '../lib/presentation-cycle';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('TV story and activity schedule', () => {
  it('pins manual harbor entry, then resumes the timed cycle after an explicit return', () => {
    const { result, unmount } = renderHook(() =>
      usePresentationController(true, false, 0, true),
    );
    act(() => {
      vi.advanceTimersByTime(37_000);
    });
    act(() => result.current.showHarbor());
    expect(result.current.phase).toBe('activity');
    expect(vi.getTimerCount()).toBe(0);
    act(() => {
      vi.advanceTimersByTime(19_000);
    });
    expect(result.current.phase).toBe('activity');
    act(() => {
      vi.advanceTimersByTime(600_000);
    });
    expect(result.current.phase).toBe('activity');
    act(() => result.current.showStories());
    expect(vi.getTimerCount()).toBe(1);
    act(() => {
      vi.advanceTimersByTime(59_000);
    });
    expect(result.current.phase).toBe('story');
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.phase).toBe('activity');
    act(() => {
      vi.advanceTimersByTime(19_000);
    });
    expect(result.current.phase).toBe('activity');
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.phase).toBe('story');
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('rejects unavailable entry and restarts a full story interval after lost eligibility', () => {
    const { result, rerender } = renderHook(
      ({ eligible }) => usePresentationController(true, false, 0, eligible),
      {
        initialProps: { eligible: false },
      },
    );
    act(() => result.current.showHarbor());
    expect(result.current.phase).toBe('story');
    rerender({ eligible: true });
    act(() => result.current.showHarbor());
    act(() => {
      vi.advanceTimersByTime(7000);
    });
    rerender({ eligible: false });
    expect(result.current.phase).toBe('story');
    rerender({ eligible: true });
    act(() => {
      vi.advanceTimersByTime(59_000);
    });
    expect(result.current.phase).toBe('story');
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.phase).toBe('activity');
  });
  it('does not enter halfway through a skipped slot when the feed recovers', () => {
    const { result, rerender } = renderHook(
      ({ eligible }) => usePresentationController(true, false, 0, eligible),
      {
        initialProps: { eligible: false },
      },
    );
    act(() => {
      vi.advanceTimersByTime(65_000);
    });
    rerender({ eligible: true });
    act(() => {
      vi.advanceTimersByTime(74_000);
    });
    expect(result.current.phase).toBe('story');
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.phase).toBe('activity');
  });
  it('preserves a manual pin across pausing and clears it on browse or TV exit/re-entry', () => {
    const { result, rerender } = renderHook(
      ({ paused, enabled, reset }) =>
        usePresentationController(enabled, paused, reset),
      {
        initialProps: { paused: false, enabled: true, reset: 0 },
      },
    );
    act(() => result.current.showHarbor());
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    rerender({ paused: true, enabled: true, reset: 0 });
    act(() => {
      vi.advanceTimersByTime(120_000);
    });
    expect(result.current.phase).toBe('activity');
    rerender({ paused: false, enabled: true, reset: 0 });
    act(() => {
      vi.advanceTimersByTime(15_000);
    });
    expect(result.current.phase).toBe('activity');
    rerender({ paused: false, enabled: true, reset: 1 });
    expect(result.current.phase).toBe('story');
    act(() => result.current.showHarbor());
    rerender({ paused: false, enabled: false, reset: 1 });
    rerender({ paused: false, enabled: true, reset: 1 });
    expect(result.current.phase).toBe('story');
  });
  it('latches stale/loading skips and aborts without late recovery in the same interlude', () => {
    const { result, rerender } = renderHook(
      ({ phase, fresh, ready }) =>
        useActivityInterlude(
          phase,
          fresh ? 'fresh' : 'stale',
          ready ? 'ready' : 'loading',
        ),
      {
        initialProps: {
          phase: 'story' as 'story' | 'activity',
          fresh: false,
          ready: false,
        },
      },
    );
    rerender({ phase: 'activity', fresh: false, ready: false });
    rerender({ phase: 'activity', fresh: true, ready: true });
    expect(result.current).toBe(false);
    rerender({ phase: 'story', fresh: true, ready: true });
    rerender({ phase: 'activity', fresh: true, ready: true });
    expect(result.current).toBe(true);
    rerender({ phase: 'activity', fresh: false, ready: true });
    expect(result.current).toBe(false);
    rerender({ phase: 'activity', fresh: true, ready: true });
    expect(result.current).toBe(false);
  });
  it('repeats a 60-second story and 20-second activity cycle', () => {
    expect(presentationPhase(0)).toBe('story');
    expect(presentationPhase(STORY_INTERVAL_MS - 1)).toBe('story');
    expect(presentationPhase(STORY_INTERVAL_MS)).toBe('activity');
    expect(presentationPhase(STORY_INTERVAL_MS + ACTIVITY_INTERVAL_MS)).toBe(
      'story',
    );
    expect(
      presentationPhase(STORY_INTERVAL_MS * 2 + ACTIVITY_INTERVAL_MS),
    ).toBe('activity');
  });

  it('pauses for visibility or dialogs and resumes without consuming time', () => {
    const { result, rerender } = renderHook(
      ({ paused }) => usePresentationCycle(true, paused, 0),
      { initialProps: { paused: false } },
    );
    act(() => {
      vi.advanceTimersByTime(59_000);
    });
    expect(result.current).toBe('story');
    rerender({ paused: true });
    act(() => {
      vi.advanceTimersByTime(120_000);
    });
    expect(result.current).toBe('story');
    rerender({ paused: false });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current).toBe('activity');
  });

  it('returns manual browsing and TV exit/re-entry immediately to a full story interval', () => {
    const { result, rerender } = renderHook(
      ({ enabled, reset }) => usePresentationCycle(enabled, false, reset),
      { initialProps: { enabled: true, reset: 0 } },
    );
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current).toBe('activity');
    rerender({ enabled: true, reset: 1 });
    expect(result.current).toBe('story');
    act(() => {
      vi.advanceTimersByTime(59_000);
    });
    expect(result.current).toBe('story');
    rerender({ enabled: false, reset: 2 });
    expect(result.current).toBe('story');
    act(() => {
      vi.advanceTimersByTime(90_000);
    });
    rerender({ enabled: true, reset: 3 });
    expect(result.current).toBe('story');
  });

  it('skips the interlude for stale feeds and failed or still-loading artwork', () => {
    expect(activityInterludeAvailable('activity', 'fresh', 'ready')).toBe(true);
    expect(activityInterludeAvailable('activity', 'stale', 'ready')).toBe(
      false,
    );
    expect(activityInterludeAvailable('activity', 'unavailable', 'ready')).toBe(
      false,
    );
    expect(activityInterludeAvailable('activity', 'fresh', 'loading')).toBe(
      false,
    );
    expect(activityInterludeAvailable('activity', 'fresh', 'error')).toBe(
      false,
    );
    expect(activityInterludeAvailable('story', 'fresh', 'ready')).toBe(false);
  });
});
