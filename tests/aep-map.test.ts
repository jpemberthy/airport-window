import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { aep } from '../airports/aep';
import type { AircraftTrack, TrackHistory } from '../lib/types';
const now = Date.parse('2026-11-18T16:00:00Z');
afterEach(() => vi.resetModules());
async function selected(elevationFt = aep.elevationFt) {
  vi.resetModules();
  vi.doMock('../airport.config', () => ({ default: { ...aep, elevationFt } }));
  return import('../lib/harbor-view');
}
const area = (a: number[], b: number[], c: number[]) =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
function flight(lon: number, lat: number, altitudeFt: number): AircraftTrack {
  return {
    id: 'abcdef',
    callsign: 'ARG123',
    registration: null,
    aircraftType: 'A320',
    lon,
    lat,
    altitudeFt,
    speedKt: 140,
    heading: 124,
    verticalRateFpm: 700,
    onGround: false,
    observedAt: now,
    airline: { name: 'Test aircraft', code: 'ZZ', color: '#fff', sprite: 0 },
  };
}
describe('Aeroparque registered map', () => {
  it('aligns the complete runway, round-trips geographic points and has no folded mesh', async () => {
    const m = await selected();
    expect(m.harborRunways).toHaveLength(1);
    const r = m.harborRunways[0];
    expect(r.name).toBe('13/31');
    for (const t of m.harborMesh) {
      const [a, b, c] = t.map((i) => m.harborAnchors[i]);
      expect(
        area(a.source, b.source, c.source) * area(a.target, b.target, c.target),
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
    const m = await selected();
    const data = JSON.parse(
      readFileSync('public/data/aep-map.json', 'utf8'),
    ) as { ways: { id: string; coordinates: [number, number][] }[] };
    for (const lane of aep.map!.taxiLanes) {
      const way = data.ways.find((w) => `osm-${w.id}` === lane.id)!;
      expect(way).toBeDefined();
      for (let i = 0; i < way.coordinates.length; i++) {
        const p = m.projectHarbor(...way.coordinates[i]);
        expect(
          Math.hypot(p[0] - lane.points[i][0], p[1] - lane.points[i][1]),
        ).toBeLessThan(8);
      }
    }
  });
  it.each([18, 8500])(
    'aligns a low runway flight by height above airport elevation (%i ft)',
    async (elevation) => {
      const m = await selected(elevation);
      const { matchHarborSurface } = await import('../lib/harbor-surface');
      const r = m.harborRunways[0];
      const lon = (r.start[0] + r.end[0]) / 2,
        lat = (r.start[1] + r.end[1]) / 2;
      const current = flight(lon, lat, elevation + 50);
      const history: TrackHistory = { current, previous: null };
      const match = matchHarborSurface({ ...current, opacity: 1 }, history);
      expect(match?.laneId).toBe('13/31');
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
    const m = await selected();
    const inside = flight(-58.416, -34.559, 500);
    const outside = { ...flight(-58.7, -34.8, 1000), id: 'outside' };
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
