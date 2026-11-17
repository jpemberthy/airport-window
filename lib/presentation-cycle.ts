import { useCallback, useEffect, useState } from 'react';

export const STORY_INTERVAL_MS = 60_000;
export const ACTIVITY_INTERVAL_MS = 20_000;
export const PRESENTATION_INTERVAL_MS =
  STORY_INTERVAL_MS + ACTIVITY_INTERVAL_MS;

export type PresentationPhase = 'story' | 'activity';
type InterludeFreshness = 'fresh' | 'stale' | 'unavailable';
type InterludeStatus = 'loading' | 'ready' | 'error';

export function presentationPhase(elapsedMs: number): PresentationPhase {
  const normalized =
    ((elapsedMs % PRESENTATION_INTERVAL_MS) + PRESENTATION_INTERVAL_MS) %
    PRESENTATION_INTERVAL_MS;
  return normalized < STORY_INTERVAL_MS ? 'story' : 'activity';
}

export function activityInterludeAvailable(
  phase: PresentationPhase,
  freshness: InterludeFreshness,
  status: InterludeStatus,
) {
  return phase === 'activity' && freshness === 'fresh' && status === 'ready';
}

/** A visibility-aware clock. Time intentionally stops while the TV is hidden
 * or a dialog owns the screen, so it never returns halfway through a scene. */
export function usePresentationCycle(
  enabled: boolean,
  paused: boolean,
  resetSignal: number,
) {
  return usePresentationController(enabled, paused, resetSignal).phase;
}

/** Manual entry suspends rotation until an explicit return/reset. Both paths
 * retain the same freshness/asset gate. */
export function usePresentationController(
  enabled: boolean,
  paused: boolean,
  resetSignal: number,
  eligible = true,
) {
  const generation = `${Number(enabled)}:${resetSignal}`;
  const [stored, setClock] = useState({
    generation,
    elapsed: 0,
    admitted: false,
    pinned: false,
    revision: 0,
  });
  let clock = stored;
  if (clock.generation !== generation || (clock.admitted && !eligible)) {
    clock = {
      generation,
      elapsed: 0,
      admitted: false,
      pinned: false,
      revision: clock.revision + 1,
    };
    setClock(clock);
  }
  const revision = clock.revision;
  const pinned = clock.pinned;
  useEffect(() => {
    if (!enabled || paused || pinned) return;
    const timer = window.setInterval(
      () =>
        setClock((value) => {
          const elapsed = (value.elapsed + 1000) % PRESENTATION_INTERVAL_MS;
          return {
            ...value,
            generation,
            elapsed,
            admitted:
              elapsed === STORY_INTERVAL_MS
                ? eligible
                : elapsed === 0
                  ? false
                  : value.admitted,
          };
        }),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [enabled, paused, generation, revision, eligible, pinned]);
  const showStories = useCallback(() => {
    setClock((value) => ({
      generation,
      elapsed: 0,
      admitted: false,
      pinned: false,
      revision: value.revision + 1,
    }));
  }, [generation]);
  const showHarbor = useCallback(() => {
    if (!enabled || !eligible) return;
    setClock((value) => ({
      generation,
      elapsed: STORY_INTERVAL_MS,
      admitted: true,
      pinned: true,
      revision: value.revision + 1,
    }));
  }, [enabled, eligible, generation]);
  return {
    phase: (enabled &&
    clock.admitted &&
    presentationPhase(clock.elapsed) === 'activity'
      ? 'activity'
      : 'story') as PresentationPhase,
    showHarbor,
    showStories,
  };
}

export function harborUnavailableReason(
  freshness: InterludeFreshness,
  status: InterludeStatus,
) {
  if (status === 'error') return 'Harbor artwork is unavailable.';
  if (status === 'loading') return 'Harbor artwork is loading.';
  if (freshness !== 'fresh') return 'Waiting for fresh aircraft positions.';
  return null;
}

/** Latch admission at the boundary. Recovery never starts half an interlude. */
export function useActivityInterlude(
  phase: PresentationPhase,
  freshness: InterludeFreshness,
  status: InterludeStatus,
) {
  const eligible = activityInterludeAvailable(phase, freshness, status);
  const [gate, setGate] = useState({ phase, admitted: eligible });
  if (gate.phase !== phase) {
    setGate({ phase, admitted: eligible });
    return eligible;
  }
  if (gate.admitted && !eligible) {
    setGate({ phase, admitted: false });
    return false;
  }
  return gate.admitted && eligible;
}
