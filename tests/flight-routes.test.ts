import { describe, expect, it } from 'vitest';
import { identifyAirline } from '../lib/airlines';
import {
  normalizeLiveFlightRoute,
  normalizeFlightSummary,
  providerTime,
  routeCaption,
  routeForMoment,
} from '../lib/flight-routes';
import type { AircraftTrack } from '../lib/types';

const now = Date.parse('2026-09-28T14:00:00Z');
const track: AircraftTrack = {
  id: 'a1b2c3',
  callsign: 'JBU1488',
  registration: 'N123JB',
  aircraftType: 'A320',
  lat: 42.39,
  lon: -71.03,
  altitudeFt: 3000,
  speedKt: 200,
  heading: 150,
  verticalRateFpm: -500,
  onGround: false,
  observedAt: now,
  airline: identifyAirline('JBU1488'),
};
const live = {
  data: [
    {
      hex: 'A1B2C3',
      callsign: 'JBU1488',
      lat: 42.39,
      lon: -71.03,
      timestamp: '2026-09-28T13:59:55Z',
      orig_icao: 'KLAX',
      orig_iata: 'LAX',
      dest_icao: 'KBOS',
      dest_iata: 'BOS',
    },
  ],
};
const city = (code: string) =>
  ({ LAX: 'Los Angeles', BOS: 'Boston' })[code as 'LAX' | 'BOS'];

describe('live flight routes', () => {
  it('uses a current record for the exact aircraft and flight', () => {
    const route = normalizeLiveFlightRoute(live, track, city, now);
    expect(route).toMatchObject({
      aircraftId: 'a1b2c3',
      origin: { code: 'LAX', city: 'Los Angeles' },
      destination: { code: 'BOS', city: 'Boston' },
    });
    expect(routeForMoment(route, 'approach')).toEqual(route);
    expect(routeCaption(route!, 'approach')).toBe('From Los Angeles · LAX');
    expect(routeForMoment(route, 'climb')).toBeNull();
    expect(routeCaption(route!, 'taxi')).toBe('LAX → BOS');
  });

  it('rejects another aircraft, reused callsign, stale position, or remote position', () => {
    const record = live.data[0];
    for (const change of [
      { hex: 'ffffff' },
      { callsign: 'JBU9999' },
      { timestamp: '2026-09-28T13:54:00Z' },
      { lat: 40.7, lon: -73.8 },
    ])
      expect(
        normalizeLiveFlightRoute(
          { data: [{ ...record, ...change }] },
          track,
          city,
          now,
        ),
      ).toBeNull();
  });

  it('requires a Boston endpoint and complete airport codes', () => {
    expect(
      normalizeLiveFlightRoute(
        { data: [live.data[0], { ...live.data[0], orig_icao: 'KJFK' }] },
        track,
        city,
        now,
      ),
    ).toBeNull();
    expect(
      normalizeLiveFlightRoute(
        { data: [{ ...live.data[0], dest_icao: 'KJFK' }] },
        track,
        city,
        now,
      ),
    ).toBeNull();
    expect(
      normalizeLiveFlightRoute(
        { data: [{ ...live.data[0], dest_icao: null }] },
        track,
        city,
        now,
      ),
    ).toBeNull();
  });
});

describe('flight summary leg matching', () => {
  const row = {
    ...live.data[0],
    fr24_id: 'leg1',
    first_seen: '2026-09-28T08:00:00',
    last_seen: '2026-09-28T13:59:55',
    flight_ended: false,
    datetime_takeoff: '2026-09-28T08:02:00',
    runway_takeoff: '25R',
  };
  it('treats zone-less provider timestamps as UTC and includes reported events only', () => {
    expect(providerTime('2026-09-28T14:00:00')).toBe(now);
    expect(
      normalizeFlightSummary({ data: [row] }, track, city, now),
    ).toMatchObject({
      flightLegId: 'leg1',
      takeoffAt: Date.parse('2026-09-28T08:02:00Z'),
      takeoffRunway: '25R',
    });
  });
  it('rejects aircraft/callsign reuse, old legs, mismatched direction and ambiguous taxi legs', () => {
    for (const change of [
      { hex: '000000' },
      { callsign: 'JBU42' },
      { last_seen: '2026-09-28T13:50:00' },
      { flight_ended: true },
      { first_seen: '2026-09-26T08:00:00' },
      { orig_icao: 'KBOS', dest_icao: 'KLAX' },
    ])
      expect(
        normalizeFlightSummary(
          { data: [{ ...row, ...change }] },
          track,
          city,
          now,
        ),
      ).toBeNull();
    expect(
      normalizeFlightSummary(
        { data: [row, { ...row, fr24_id: 'leg2' }] },
        { ...track, onGround: true },
        city,
        now,
      ),
    ).toBeNull();
  });
  it('handles arrivals, departures, diversions, and a just-ended landing', () => {
    expect(
      normalizeFlightSummary(
        { data: [{ ...row, orig_icao: 'KBOS', dest_icao: 'KLAX' }] },
        { ...track, verticalRateFpm: 500 },
        city,
        now,
      )?.origin.icao,
    ).toBe('KBOS');
    expect(
      normalizeFlightSummary(
        { data: [{ ...row, dest_icao_actual: 'KJFK' }] },
        track,
        city,
        now,
      ),
    ).toBeNull();
    expect(
      normalizeFlightSummary(
        {
          data: [
            {
              ...row,
              flight_ended: 'true',
              datetime_landed: '2026-09-28T13:59:30',
              runway_landed: '22L',
            },
          ],
        },
        { ...track, onGround: true },
        city,
        now,
      )?.landingRunway,
    ).toBe('22L');
  });
});
