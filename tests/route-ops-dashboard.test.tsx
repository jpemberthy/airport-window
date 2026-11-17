// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RouteOpsDashboard } from '../components/route-ops-dashboard';
import { unavailableRouteOpsSnapshot } from '../lib/route-ops';

const now = Date.parse('2026-10-14T12:00:00Z');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: 'visible',
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('route operations dashboard', () => {
  it('renders healthy and empty states, refreshes, and pauses while hidden', async () => {
    const snapshot = unavailableRouteOpsSnapshot(now);
    snapshot.newLookupStatus = {
      state: 'available',
      detail: 'A new Summary lookup can be reserved now.',
      nextBoundaryAt: null,
      bostonBlock: 'daytime',
    };
    const fetcher = vi.fn(async () => Response.json(snapshot));
    vi.stubGlobal('fetch', fetcher);
    render(<RouteOpsDashboard />);
    expect(screen.getByText('Loading route operations…')).toBeTruthy();
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(screen.getByText('Available')).toBeTruthy();
    expect(
      screen.getByText('No unexpired exact routes are cached.'),
    ).toBeTruthy();
    expect(fetcher).toHaveBeenCalledTimes(1);

    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(fetcher).toHaveBeenCalledTimes(2);
    Object.defineProperty(document, 'visibilityState', { value: 'hidden' });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    Object.defineProperty(document, 'visibilityState', { value: 'visible' });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh now' }));
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it('keeps an explicit error state when a refresh fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Offline')));
    render(<RouteOpsDashboard />);
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(screen.getByText('Offline')).toBeTruthy();
  });
});
