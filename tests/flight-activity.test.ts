import { describe, expect, it } from 'vitest';
import { identifyAirline } from '../lib/airlines';
import { flightActivity } from '../lib/flight-activity';
import { AIRPORT } from '../lib/geo';
import type { AircraftTrack, TrackHistory } from '../lib/types';

const now = Date.parse('2026-10-15T18:00:00Z');

function history(
  id: string,
  distanceNm: number,
  overrides: Partial<AircraftTrack> = {},
): TrackHistory {
  const current: AircraftTrack = {
    id,
    callsign: `JBU${id}`,
    registration: null,
    aircraftType: 'A320',
    lat: AIRPORT.lat + distanceNm / 60,
    lon: AIRPORT.lon,
    altitudeFt: 2400,
    speedKt: 190,
    heading: 180,
    verticalRateFpm: 0,
    onGround: false,
    observedAt: now,
    airline: identifyAirline('JBU123'),
    ...overrides,
  };
  return { previous: null, current };
}

function summary(...items: TrackHistory[]) {
  return flightActivity(
    new Map(items.map((item) => [item.current.id, item])),
    now,
  );
}

describe('living airspace summary', () => {
  it('uses the close Logan frame for a fresh but empty feed', () => {
    expect(summary()).toMatchObject({
      total: 0,
      inbound: 0,
      outbound: 0,
      ground: 0,
      other: 0,
      coverageNm: 3,
    });
  });

  it.each([
    [2.9, 3],
    [3.01, 8],
    [7.99, 8],
    [8.01, 20],
    [19.8, 20],
  ] as const)(
    'frames traffic at %s NM with the %s NM view',
    (distance, view) => {
      expect(summary(history('range', distance)).coverageNm).toBe(view);
    },
  );

  it('classifies inferred inbound, outbound, ground, and passing traffic', () => {
    const result = summary(
      history('inbound', 6, { verticalRateFpm: -600 }),
      history('outbound', 5, { verticalRateFpm: 700 }),
      history('ground', 1, {
        onGround: true,
        altitudeFt: 0,
        speedKt: 12,
      }),
      history('other', 18, { verticalRateFpm: -900 }),
    );
    expect(result).toMatchObject({
      total: 4,
      inbound: 1,
      outbound: 1,
      ground: 1,
      other: 1,
      coverageNm: 20,
    });
    expect(Object.fromEntries(result.kinds)).toEqual({
      inbound: 'inbound',
      outbound: 'outbound',
      ground: 'ground',
      other: 'other',
    });
  });

  it('uses observed movement when vertical rate is ambiguous', () => {
    const inbound = history('moving-in', 5, { observedAt: now });
    inbound.previous = {
      ...inbound.current,
      lat: AIRPORT.lat + 5.4 / 60,
      observedAt: now - 5000,
    };
    const outbound = history('moving-out', 5, { observedAt: now });
    outbound.previous = {
      ...outbound.current,
      lat: AIRPORT.lat + 4.6 / 60,
      observedAt: now - 5000,
    };
    expect(summary(inbound, outbound)).toMatchObject({
      inbound: 1,
      outbound: 1,
    });
  });

  it('excludes future and 60-second-old reports while retaining the last fading report', () => {
    const result = summary(
      history('fresh', 2, { observedAt: now - 59_999 }),
      history('expired', 19, { observedAt: now - 60_000 }),
      history('future', 10, { observedAt: now + 1 }),
    );
    expect(result.total).toBe(1);
    expect(result.coverageNm).toBe(3);
    expect([...result.kinds.keys()]).toEqual(['fresh']);
  });
});
