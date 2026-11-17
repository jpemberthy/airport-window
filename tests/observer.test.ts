import { describe, expect, it } from 'vitest';
import { identifyAirline } from '../lib/airlines';
import {
  DEFAULT_OBSERVER,
  nearbyMoments,
  proximity,
  readObserver,
  rememberNearby,
} from '../lib/observer';
import { advanceRotation, initialRotation } from '../lib/flight-rotation';
import type { AircraftTrack, TrackHistory } from '../lib/types';

const now = Date.parse('2026-10-11T12:00:00Z');
const point = { lat: 42.38, lon: -70.98 };
const track = (change: Partial<AircraftTrack> = {}): AircraftTrack => ({
  id: 'abcdef',
  callsign: 'JBU12',
  lat: 42.38,
  lon: -70.99,
  altitudeFt: 1200,
  speedKt: 180,
  onGround: false,
  verticalRateFpm: -500,
  heading: 180,
  observedAt: now,
  registration: null,
  aircraftType: 'A320',
  airline: identifyAirline('JBU12'),
  ...change,
});
const tracks = (...items: AircraftTrack[]) =>
  new Map(
    items.map((current) => [
      current.id,
      { current, previous: null } as TrackHistory,
    ]),
  );

describe('personal nearby flights', () => {
  it('defaults to airport view and rejects corrupt or remote stored locations', () => {
    for (const raw of [
      null,
      'broken',
      '{}',
      JSON.stringify({ mode: 'nearby', viewpoint: { lat: 0, lon: 0 } }),
    ])
      expect(readObserver(raw)).toEqual(DEFAULT_OBSERVER);
    expect(
      readObserver(JSON.stringify({ mode: 'nearby', viewpoint: point })),
    ).toEqual({ mode: 'nearby', viewpoint: point });
  });
  it('computes approximate compass direction and three-dimensional distance', () => {
    expect(proximity(track(), point)).toMatchObject({ direction: 'W' });
    expect(
      proximity(
        track({ lat: point.lat, lon: point.lon, altitudeFt: 5280 }),
        point,
      ).slantMiles,
    ).toBeCloseTo(1);
  });
  it('ranks fresh low overlapping aircraft and excludes stale, high, remote and unclassified tracks', () => {
    const group = tracks(
      track(),
      track({ id: '111111', altitudeFt: 5000 }),
      track({ id: '222222', altitudeFt: 6021 }),
      track({ id: '333333', observedAt: now - 35000 }),
      track({ id: '444444', lat: 42.6 }),
      track({ id: '555555', verticalRateFpm: 0 }),
    );
    expect(nearbyMoments(group, point, now).map((c) => c.flight.id)).toEqual([
      'abcdef',
      '111111',
    ]);
  });
  it('keeps a recent landing transition for a minute even after taxi classification fades', () => {
    const group = tracks(
      track({ lat: 42.365, lon: -71.005, onGround: true, speedKt: 2 }),
    );
    group.get('abcdef')!.groundTransition = {
      fromGround: false,
      observedAt: now - 59000,
    };
    expect(nearbyMoments(group, point, now)[0]).toMatchObject({
      moment: 'landing',
      transition: true,
    });
    expect(nearbyMoments(group, point, now + 1001)).toHaveLength(0);
  });
  it('preserves viewing cadence despite a closer candidate arriving', () => {
    const group = tracks(track());
    const first = advanceRotation(
      initialRotation,
      nearbyMoments(group, point, now),
      group,
      now,
      12000,
    );
    group.set('111111', {
      current: track({ id: '111111', lon: point.lon, altitudeFt: 100 }),
      previous: null,
    });
    expect(
      advanceRotation(
        first,
        nearbyMoments(group, point, now + 1000),
        group,
        now + 1000,
        12000,
      ).featured?.id,
    ).toBe('abcdef');
    expect(
      advanceRotation(
        first,
        nearbyMoments(group, point, now + 12000),
        group,
        now + 12000,
        12000,
      ).featured?.id,
    ).toBe('111111');
  });
  it('retains snapshots for five minutes without refreshing timestamps on clock ticks', () => {
    const candidates = nearbyMoments(tracks(track()), point, now);
    const history = rememberNearby([], candidates, now);
    expect(rememberNearby(history, candidates, now + 30000)[0].lastSeen).toBe(
      now,
    );
    expect(rememberNearby(history, [], now + 299999)).toHaveLength(1);
    expect(rememberNearby(history, [], now + 300000)).toHaveLength(0);
    expect(
      rememberNearby(
        history,
        nearbyMoments(tracks(track({ callsign: 'JBU13' })), point, now),
        now,
      ),
    ).toHaveLength(2);
  });
});
