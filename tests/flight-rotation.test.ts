import { describe, expect, it } from 'vitest';
import { identifyAirline } from '../lib/airlines';
import { liveMoments } from '../lib/flight-story';
import {
  advanceRotation,
  browseRotation,
  featuredMoment,
  initialRotation,
  PAGE_CADENCE_MS,
  PRESENTATION_CADENCE_MS,
  type RotationState,
} from '../lib/flight-rotation';
import { mergeTracks } from '../lib/tracks';
import type { AircraftTrack, TrackHistory } from '../lib/types';

const start = 1_000_000;
function report(
  id: string,
  observedAt: number,
  overrides: Partial<AircraftTrack> = {},
): AircraftTrack {
  return {
    id,
    callsign: `DAL${id}`,
    registration: null,
    aircraftType: 'A320',
    lat: 42.39,
    lon: -71.03,
    altitudeFt: 3200,
    speedKt: 210,
    heading: 170,
    verticalRateFpm: -500,
    onGround: false,
    observedAt,
    airline: identifyAirline('DAL324'),
    ...overrides,
  };
}

function sequence(cadence = PAGE_CADENCE_MS) {
  let tracks = new Map<string, TrackHistory>();
  let state: RotationState = initialRotation;
  return {
    update(now: number, incoming: AircraftTrack[] = []) {
      tracks = mergeTracks(tracks, incoming, now);
      state = advanceRotation(
        state,
        liveMoments(tracks, now),
        tracks,
        now,
        cadence,
      );
      return featuredMoment(state, tracks, now);
    },
    browse(now: number, step: number) {
      state = browseRotation(state, liveMoments(tracks, now), now, step);
      return featuredMoment(state, tracks, now);
    },
    get state() {
      return state;
    },
  };
}

describe('flight continuity and pacing', () => {
  it('follows fresh approach, touchdown, and taxi reports without timed phase invention', () => {
    const story = sequence(PRESENTATION_CADENCE_MS);
    expect(story.update(start, [report('324', start)])?.moment).toBe(
      'approach',
    );
    expect(story.update(start + 4_000)?.moment).toBe('approach');
    expect(
      story.update(start + 5_000, [
        report('324', start + 5_000, { altitudeFt: 180, speedKt: 130 }),
      ])?.moment,
    ).toBe('landing');
    expect(story.state.featured?.since).toBe(start + 5_000);
    expect(
      story.update(start + 10_000, [
        report('324', start + 10_000, {
          onGround: true,
          altitudeFt: 0,
          speedKt: 80,
        }),
      ])?.moment,
    ).toBe('landing');
    expect(story.update(start + 26_000)?.moment).toBe('landing');
    expect(
      story.update(start + 30_000, [
        report('324', start + 30_000, {
          onGround: true,
          altitudeFt: 0,
          speedKt: 17,
        }),
      ])?.moment,
    ).toBe('taxi');
    expect(story.state.featured?.id).toBe('324');
  });

  it('keeps a takeoff through the supported climb', () => {
    const story = sequence();
    expect(
      story.update(start, [
        report('818', start, { onGround: true, altitudeFt: 0, speedKt: 105 }),
      ]),
    ).toBeNull();
    expect(
      story.update(start + 5_000, [
        report('818', start + 5_000, {
          altitudeFt: 210,
          speedKt: 170,
          verticalRateFpm: 900,
        }),
      ])?.moment,
    ).toBe('takeoff');
    expect(story.update(start + 10_000)?.moment).toBe('takeoff');
    expect(
      story.update(start + 18_000, [
        report('818', start + 18_000, {
          altitudeFt: 2400,
          speedKt: 220,
          verticalRateFpm: 800,
        }),
      ])?.moment,
    ).toBe('climb');
    expect(story.state.featured?.since).toBe(start + 18_000);
  });

  it('holds brief ambiguity and rejects a single noisy reversal', () => {
    const story = sequence();
    story.update(start, [report('324', start)]);
    expect(
      story.update(start + 5_000, [
        report('324', start + 5_000, { verticalRateFpm: 0 }),
      ])?.moment,
    ).toBe('approach');
    expect(
      story.update(start + 8_000, [
        report('324', start + 8_000, { verticalRateFpm: 800 }),
      ])?.moment,
    ).toBe('approach');
    expect(story.state.featured?.pending?.moment).toBe('climb');
    expect(
      story.update(start + 11_000, [
        report('324', start + 11_000, { verticalRateFpm: -500 }),
      ])?.moment,
    ).toBe('approach');
    expect(story.state.featured?.pending).toBeNull();
    expect(
      story.update(start + 16_000, [
        report('324', start + 16_000, {
          altitudeFt: 220,
          verticalRateFpm: -500,
        }),
      ])?.moment,
    ).toBe('landing');
  });

  it('uses stable ordering, favors unseen reports, and avoids quick repeats', () => {
    const a = report('a', start);
    const b = report('b', start);
    const c = report('c', start);
    const first = sequence();
    const second = sequence();
    expect(first.update(start, [c, a, b])?.flight.id).toBe('a');
    expect(second.update(start, [b, c, a])?.flight.id).toBe('a');
    expect(first.update(start + 12_000, [b, a, c])?.flight.id).toBe('b');
    expect(first.update(start + 24_000)?.flight.id).toBe('c');
    expect(first.update(start + 25_000)?.flight.id).toBe('c');
    expect(
      first.update(start + 36_000, [
        report('a', start + 36_000),
        report('b', start + 36_000),
        report('c', start + 36_000),
      ])?.flight.id,
    ).toBe('a');
  });

  it('responds to manual browsing at once and restarts presentation cadence', () => {
    const story = sequence(PRESENTATION_CADENCE_MS);
    story.update(start, [report('a', start), report('b', start)]);
    expect(story.browse(start + 100, 1)?.flight.id).toBe('b');
    expect(story.update(start + 19_000)?.flight.id).toBe('b');
    expect(story.update(start + 20_200)?.flight.id).toBe('a');
    expect(story.browse(start + 20_300, -1)?.flight.id).toBe('b');
  });

  it('can browse away from a held ambiguous flight when one alternative qualifies', () => {
    const story = sequence();
    story.update(start, [
      report('a', start),
      report('b', start, { onGround: true, altitudeFt: 0, speedKt: 18 }),
    ]);
    expect(story.state.featured?.id).toBe('a');
    expect(
      story.update(start + 5_000, [
        report('a', start + 5_000, { verticalRateFpm: 0 }),
      ])?.flight.id,
    ).toBe('a');
    expect(story.browse(start + 5_100, -1)?.flight.id).toBe('b');
  });

  it('releases missing reports and settles into a stable quiet scene', () => {
    const story = sequence();
    story.update(start, [report('a', start)]);
    expect(story.update(start + 12_000)?.flight.id).toBe('a');
    expect(story.update(start + 35_000)).toBeNull();
    expect(story.update(start + 40_000)).toBeNull();
    expect(story.update(start + 60_000)).toBeNull();
    expect(
      story.update(start + 61_000, [report('b', start + 61_000)])?.flight.id,
    ).toBe('b');
  });
});
