import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { aep } from '../airports/aep';
import { mde } from '../airports/mde';
import type { AirportPack } from '../airports/types';
import type { AircraftTrack, TrackHistory } from '../lib/types';
const now = Date.parse('2026-11-18T16:00:00Z');
afterEach(() => vi.resetModules());
async function selected(pack: AirportPack, elevationFt = pack.elevationFt) {
  vi.resetModules();
  vi.doMock('../airport.config', () => ({ default: { ...pack, elevationFt } }));
  return import('../lib/harbor-view');
}
const area = (a: number[], b: number[], c: number[]) =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
function flight(
  lon: number,
  lat: number,
  altitudeFt: number,
  heading = 0,
): AircraftTrack {
  return {
    id: 'abcdef',
    callsign: 'ARG123',
    registration: null,
    aircraftType: 'A320',
    lon,
    lat,
    altitudeFt,
    speedKt: 140,
    heading,
    verticalRateFpm: 700,
    onGround: false,
    observedAt: now,
    airline: { name: 'Test aircraft', code: 'ZZ', color: '#fff', sprite: 0 },
  };
}
for (const pack of [aep, mde])
  describe(`${pack.id} registered map`, () => {
    it('aligns the complete runway, round-trips geographic points and has no folded mesh', async () => {
      const m = await selected(pack);
      expect(m.harborRunways).toHaveLength(1);
      const r = m.harborRunways[0];
      expect(r.name).toBe(pack.map!.runways[0].name);
      for (const t of m.harborMesh) {
        const [a, b, c] = t.map((i) => m.harborAnchors[i]);
        expect(
          area(a.source, b.source, c.source) *
            area(a.target, b.target, c.target),
        ).toBeGreaterThan(0);
      }
      for (let i = 0; i <= 40; i++) {
        const f = i / 40;
        const geo = r.start.map((n, j) => n * (1 - f) + r.end[j] * f) as [
          number,
          number,
        ];
        const p = m.projectHarbor(...geo);
        const a = r.artStart,
          b = r.artEnd;
        const lineError =
          Math.abs(area(a, b, p)) / Math.hypot(b[0] - a[0], b[1] - a[1]);
        expect(lineError).toBeLessThan(2);
        const back = m.unprojectHarbor(...p);
        expect(back[0]).toBeCloseTo(geo[0], 8);
        expect(back[1]).toBeCloseTo(geo[1], 8);
      }
      for (const p of [
        [100, 100],
        [300, 600],
        [800, 470],
        [1200, 350],
        [1500, 850],
      ] as [number, number][]) {
        const back = m.projectHarbor(...m.unprojectHarbor(...p));
        expect(back[0]).toBeCloseTo(p[0], 5);
        expect(back[1]).toBeCloseTo(p[1], 5);
      }
    });
    it('keeps taxiway coordinates registered to the bundled source geometry', async () => {
      const m = await selected(pack);
      const data = JSON.parse(
        readFileSync(`public/data/${pack.id}-map.json`, 'utf8'),
      ) as { ways: { id: string; coordinates: [number, number][] }[] };
      for (const lane of pack.map!.taxiLanes) {
        const way = data.ways.find((w) => `osm-${w.id}` === lane.id)!;
        expect(way).toBeDefined();
        for (let i = 0; i < way.coordinates.length; i++) {
          const p = m.projectHarbor(...way.coordinates[i]);
          expect(
            Math.hypot(p[0] - lane.points[i][0], p[1] - lane.points[i][1]),
        ).toBeLessThan(0.01);
        }
      }
    });
    it.each([pack.elevationFt, 8500])(
      'aligns a low runway flight by height above airport elevation (%i ft)',
      async (elevation) => {
        const m = await selected(pack, elevation);
        const { matchHarborSurface } = await import('../lib/harbor-surface');
        const r = m.harborRunways[0];
        const lon = (r.start[0] + r.end[0]) / 2,
          lat = (r.start[1] + r.end[1]) / 2;
        const heading =
          ((Math.atan2(
            (r.end[0] - r.start[0]) * Math.cos((lat * Math.PI) / 180),
            r.end[1] - r.start[1],
          ) *
            180) /
            Math.PI +
            360) %
          360;
        const current = flight(lon, lat, elevation + 50, heading);
        const history: TrackHistory = { current, previous: null };
        const match = matchHarborSurface({ ...current, opacity: 1 }, history);
        expect(match?.laneId).toBe(r.name);
        expect(match?.strength).toBeCloseTo(1);
        const high = { ...current, altitudeFt: elevation + 350 };
        expect(
          matchHarborSurface(
            { ...high, opacity: 1 },
            { current: high, previous: null },
          ),
        ).toBeNull();
      },
    );
    it('counts off-map traffic without pulling it onto the painting and excludes stale reports', async () => {
      const m = await selected(pack);
      const inside = flight(
        pack.center.lon,
        pack.center.lat,
        pack.elevationFt + 500,
      );
      const outside = {
        ...flight(
          pack.center.lon + 1,
          pack.center.lat + 1,
          pack.elevationFt + 1000,
        ),
        id: 'outside',
      };
      const stale = { ...inside, id: 'stale', observedAt: now - 61000 };
      const tracks = new Map(
        [inside, outside, stale].map((current) => [
          current.id,
          { current, previous: null } as TrackHistory,
        ]),
      );
      const view = m.harborView(tracks, now, m.harborFrame(1672, 941), true);
      expect(view.total).toBe(1);
      expect(view.outside).toBe(1);
      expect(view.feedTotal).toBe(2);
      expect(view.aircraft.find((p) => p.id === 'outside')?.inView).toBe(false);
    });
  });
