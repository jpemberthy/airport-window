import { describe, it, expect } from 'vitest';
import map from '../public/data/logan-map.json';
import runwaysSource from '../public/data/runways-source.json';
import { project, unproject, localMeters, AIRPORT } from '../lib/geo';
import {
  interpolateHeading,
  mergeTracks,
  sampleTrack,
  phase,
} from '../lib/tracks';
import { normalizeTraffic } from '../lib/normalize';
import { daylight, airportTime, airportZone } from '../lib/daylight';
import { readPreferences } from '../lib/preferences';
const now = Date.parse('2026-09-07T18:00:00Z');
const track = normalizeTraffic(
  {
    now,
    ac: [
      {
        hex: 'abc123',
        lat: 42.36,
        lon: -71.01,
        flight: 'JBU123',
        seen_pos: 0,
        alt_baro: 1200,
        gs: 200,
        track: 355,
      },
    ],
  },
  now,
).aircraft[0];
describe('shared geographic projection', () => {
  it('preserves every threshold from the OurAirports source extract', () => {
    for (const r of map.runways) {
      const source = runwaysSource.find(
        (s) => `${s.le_ident}/${s.he_ident}` === r.name,
      )!;
      expect(r.start).toEqual([
        Number(source.le_longitude_deg),
        Number(source.le_latitude_deg),
      ]);
      expect(r.end).toEqual([
        Number(source.he_longitude_deg),
        Number(source.he_latitude_deg),
      ]);
    }
  });
  it('centers Logan and roundtrips pan/zoom coordinates', () => {
    expect(project(AIRPORT.lon, AIRPORT.lat, 1000, 600)).toEqual([530, 306]);
    for (const zoom of [0.12, 1, 2.5]) {
      const point = project(-71.02, 42.38, 1920, 1080, zoom, [-71, 42.37]);
      const result = unproject(...point, 1920, 1080, zoom, [-71, 42.37]);
      expect(result[0]).toBeCloseTo(-71.02, 8);
      expect(result[1]).toBeCloseTo(42.38, 8);
    }
  });
  it('bundles all six OurAirports runway pairs with plausible lengths', () => {
    expect(map.runways.map((r) => r.name).sort()).toEqual([
      '04L/22R',
      '04R/22L',
      '09/27',
      '14/32',
      '15L/33R',
      '15R/33L',
    ]);
    for (const r of map.runways) {
      const a = localMeters(r.start[0], r.start[1]),
        b = localMeters(r.end[0], r.end[1]);
      expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeGreaterThan(700);
      expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeLessThan(3200);
    }
  });
});
describe('honest aircraft movement', () => {
  it('does not infer a transition or interpolate across a provider switch', () => {
    const ground = { ...track, onGround: true, altitudeFt: 0 };
    let tracks = mergeTracks(new Map(), [ground], now);
    const backup = {
      ...track,
      positionSource: 'adsb-fi' as const,
      observedAt: now + 5000,
    };
    tracks = mergeTracks(tracks, [backup], now + 5000);
    expect(tracks.get(track.id)?.previous).toBeNull();
    expect(tracks.get(track.id)?.groundTransition).toBeNull();
    tracks = mergeTracks(
      tracks,
      [{ ...backup, onGround: true, observedAt: now + 10000 }],
      now + 10000,
    );
    expect(tracks.get(track.id)?.groundTransition).toMatchObject({
      fromGround: false,
      observedAt: now + 10000,
    });
  });

  it('wraps north by the shortest turn', () => {
    expect(interpolateHeading(355, 5, 0.5)).toBe(0);
    expect(interpolateHeading(5, 355, 0.5)).toBe(0);
  });
  it('interpolates between observations in the presentation buffer', () => {
    const previous = {
      ...track,
      observedAt: now - 5000,
      lat: 42.35,
      heading: 5,
    };
    const sample = sampleTrack({ previous, current: track }, now + 2500);
    expect(sample.lat).toBeCloseTo(42.355, 8);
    expect(sample.heading).toBe(0);
  });
  it('stops movement ten seconds after the newest position and fades at 30', () => {
    const h = { previous: null, current: track };
    expect(sampleTrack(h, now + 10_000).lat).toBe(
      sampleTrack(h, now + 25_000).lat,
    );
    expect(sampleTrack(h, now + 45_000).opacity).toBe(0.5);
    expect(sampleTrack(h, now + 60_000).opacity).toBe(0);
  });
  it('leaves missing speed or heading stationary', () => {
    expect(
      sampleTrack(
        { previous: null, current: { ...track, heading: null } },
        now + 8000,
      ).lat,
    ).toBe(track.lat);
  });
  it('switches ground/air height without interpolating below ground', () => {
    const ground = { ...track, onGround: true, altitudeFt: 0 };
    expect(
      sampleTrack(
        { previous: { ...track, observedAt: now - 5000 }, current: ground },
        now + 2500,
      ),
    ).toMatchObject({ altitudeFt: 0, onGround: true });
    expect(phase(ground)).toBe('Taxiing');
  });
  it('reduced motion uses the latest observed position', () => {
    expect(
      sampleTrack({ previous: null, current: track }, now + 8000, true).lat,
    ).toBe(track.lat);
  });
  it('ignores older snapshots and removes tracks after 60 seconds', () => {
    let tracks = mergeTracks(new Map(), [track], now);
    tracks = mergeTracks(
      tracks,
      [{ ...track, observedAt: now - 5000, lat: 0 }],
      now + 5000,
    );
    expect(tracks.get(track.id)?.current.lat).toBe(track.lat);
    expect(mergeTracks(tracks, [], now + 59_999).size).toBe(1);
    expect(mergeTracks(tracks, [], now + 60_000).size).toBe(0);
  });
});
describe('Boston daylight and device preferences', () => {
  it('uses real daytime and nighttime sun positions', () => {
    expect(daylight(Date.parse('2026-09-07T16:00:00Z')).phase).toBe('Daylight');
    expect(daylight(Date.parse('2026-09-08T04:00:00Z')).phase).toBe(
      'After dark',
    );
  });
  it('has distinct dawn, sunset and daytime palettes', () => {
    const sun = daylight(now);
    expect(sun.sunrise).not.toBeNull();
    expect(daylight(sun.sunrise! + 5 * 60_000).phase).toBe('Golden hour');
    expect(daylight(sun.sunset! + 8 * 60_000).phase).toBe('Blue hour');
  });
  it('handles both Boston DST transitions', () => {
    expect(airportTime(Date.parse('2026-03-08T06:59:00Z'))).toBe('01:59');
    expect(airportTime(Date.parse('2026-03-08T07:00:00Z'))).toBe('03:00');
    expect(airportZone(Date.parse('2026-11-01T05:59:00Z'))).toBe('EDT');
    expect(airportTime(Date.parse('2026-11-01T06:00:00Z'))).toBe('01:00');
    expect(airportZone(Date.parse('2026-11-01T06:00:00Z'))).toBe('EST');
  });
  it('rejects corrupt stored preferences and clamps valid values', () => {
    expect(readPreferences('{')).toEqual(readPreferences(null));
    expect(
      readPreferences(
        JSON.stringify({
          volume: 3,
          muted: true,
          view: { zoom: 100, center: [0, 0] },
        }),
      ),
    ).toMatchObject({
      volume: 1,
      muted: true,
      view: { zoom: 2.5, center: [AIRPORT.lon, AIRPORT.lat] },
    });
  });
});
