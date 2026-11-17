import type { LiveMoment, FlightMoment } from './flight-story';
import type { TrackHistory } from './types';

const CARD_FRESH_MS = 35_000;
const UNCERTAIN_HOLD_MS = 15_000;
export const PAGE_CADENCE_MS = 12_000;
export const PRESENTATION_CADENCE_MS = 20_000;

export interface Spotlight {
  id: string;
  moment: FlightMoment;
  since: number;
  supportedAt: number;
  pending: { moment: FlightMoment; observedAt: number } | null;
}

export interface RotationState {
  featured: Spotlight | null;
  recent: string[];
  shown: Record<string, { moment: FlightMoment; observedAt: number }>;
  suppressed: { id: string; observedAt: number } | null;
}

export const initialRotation: RotationState = {
  featured: null,
  recent: [],
  shown: {},
  suppressed: null,
};

const forward: Record<FlightMoment, FlightMoment[]> = {
  approach: ['landing'],
  landing: ['taxi'],
  taxi: ['takeoff'],
  takeoff: ['climb'],
  climb: [],
};

function fresh(moment: LiveMoment, now: number) {
  const age = now - moment.flight.observedAt;
  return age >= 0 && age < CARD_FRESH_MS;
}

export function rotatingMoments(moments: LiveMoment[], now: number) {
  return moments.filter((moment) => fresh(moment, now));
}

function remember(state: RotationState, next: Spotlight): RotationState {
  const old = state.featured;
  const shown = {
    ...state.shown,
    [next.id]: { moment: next.moment, observedAt: next.supportedAt },
  };
  // A TV window can run for days; retain enough history for repeat avoidance.
  const recentShown = Object.fromEntries(
    Object.entries(shown)
      .sort((a, b) => b[1].observedAt - a[1].observedAt)
      .slice(0, 80),
  );
  return {
    featured: next,
    recent:
      old && old.id !== next.id
        ? [old.id, ...state.recent.filter((id) => id !== old.id)].slice(0, 2)
        : state.recent,
    shown: recentShown,
    suppressed: null,
  };
}

function pick(
  state: RotationState,
  options: LiveMoment[],
  now: number,
  excludeId?: string,
): RotationState {
  let choices = options.filter(
    ({ flight }) =>
      flight.id !== excludeId &&
      !(
        state.suppressed?.id === flight.id &&
        flight.observedAt <= state.suppressed.observedAt
      ),
  );
  if (!choices.length) return { ...state, featured: null };
  const withoutRecent = choices.filter(
    ({ flight }) => !state.recent.includes(flight.id),
  );
  if (withoutRecent.length) choices = withoutRecent;
  else if (choices.length > 1)
    choices = choices.filter(({ flight }) => flight.id !== state.recent[0]);
  choices.sort((a, b) => {
    const priority = (option: LiveMoment) => {
      const shown = state.shown[option.flight.id];
      return !shown
        ? 3
        : option.flight.observedAt > shown.observedAt
          ? shown.moment !== option.moment
            ? 4
            : 2
          : 0;
    };
    return (
      (a.priority !== undefined && b.priority !== undefined
        ? a.priority - b.priority
        : 0) ||
      priority(b) - priority(a) ||
      b.flight.observedAt - a.flight.observedAt ||
      a.flight.id.localeCompare(b.flight.id)
    );
  });
  const selected = choices[0];
  return remember(state, {
    id: selected.flight.id,
    moment: selected.moment,
    since: now,
    supportedAt: selected.flight.observedAt,
    pending: null,
  });
}

/** Reconcile reports and the display clock. The clock can select a new flight,
 * but a phase only changes when a newer report supports it. */
export function advanceRotation(
  state: RotationState,
  moments: LiveMoment[],
  tracks: Map<string, TrackHistory>,
  now: number,
  cadenceMs: number,
): RotationState {
  const options = rotatingMoments(moments, now);
  const current = state.featured;
  if (!current) return pick(state, options, now);

  const report = tracks.get(current.id)?.current;
  const candidate = options.find(({ flight }) => flight.id === current.id);
  let next = state;
  let supported = false;
  if (candidate) {
    const observedAt = candidate.flight.observedAt;
    if (candidate.moment === current.moment) {
      supported = true;
      if (observedAt > current.supportedAt)
        next = remember(state, {
          ...current,
          supportedAt: observedAt,
          pending: null,
        });
    } else if (
      observedAt > current.supportedAt &&
      forward[current.moment].includes(candidate.moment)
    ) {
      // A plausible next scene gets its own full viewing interval.
      return remember(state, {
        id: current.id,
        moment: candidate.moment,
        since: now,
        supportedAt: observedAt,
        pending: null,
      });
    } else if (observedAt > current.supportedAt) {
      // An unexpected reversal needs a second distinct report before it
      // replaces the current inference.
      if (
        current.pending?.moment === candidate.moment &&
        observedAt > current.pending.observedAt
      )
        return remember(state, {
          id: current.id,
          moment: candidate.moment,
          since: now,
          supportedAt: observedAt,
          pending: null,
        });
      if (current.pending?.observedAt !== observedAt)
        next = {
          ...state,
          featured: {
            ...current,
            pending: { moment: candidate.moment, observedAt },
          },
        };
    }
  }

  const active = next.featured!;
  const reportFresh =
    report &&
    now - report.observedAt >= 0 &&
    now - report.observedAt < CARD_FRESH_MS;
  const hold = reportFresh && now - active.supportedAt < UNCERTAIN_HOLD_MS;
  if (!supported && !hold) {
    const suppressed = candidate
      ? { id: current.id, observedAt: candidate.flight.observedAt }
      : null;
    return pick(
      { ...next, featured: null, suppressed },
      options,
      now,
      current.id,
    );
  }

  if (now - active.since < cadenceMs) return next;
  const alternative = pick(next, options, now, current.id);
  return alternative.featured ? alternative : next;
}

/** Manual controls follow the stable card order and respond on the click. */
export function browseRotation(
  state: RotationState,
  moments: LiveMoment[],
  now: number,
  step: number,
): RotationState {
  const options = rotatingMoments(moments, now);
  if (
    !options.length ||
    (options.length === 1 && options[0].flight.id === state.featured?.id)
  )
    return state;
  const index = options.findIndex(
    ({ flight }) => flight.id === state.featured?.id,
  );
  const nextIndex =
    index < 0
      ? step > 0
        ? 0
        : options.length - 1
      : (index + step + options.length) % options.length;
  const selected = options[nextIndex];
  return remember(state, {
    id: selected.flight.id,
    moment: selected.moment,
    since: now,
    supportedAt: selected.flight.observedAt,
    pending: null,
  });
}

export function featuredMoment(
  state: RotationState,
  tracks: Map<string, TrackHistory>,
  now: number,
): LiveMoment | null {
  const featured = state.featured;
  if (!featured) return null;
  const flight = tracks.get(featured.id)?.current;
  if (!flight || now - flight.observedAt >= CARD_FRESH_MS) return null;
  return { flight, moment: featured.moment };
}
