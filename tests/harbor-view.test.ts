import { describe, expect, it } from 'vitest';
import {
  harborAnchors,
  harborFrame,
  harborGuide,
  harborHeading,
  harborMesh,
  harborRunways,
  harborView,
  projectHarbor,
  registerHarbor,
} from '../lib/harbor-view';
import {
  harborFixtureTracks,
  HARBOR_FIXTURE_EPOCH as now,
} from '../lib/harbor-fixtures';
import { sampleTrack } from '../lib/tracks';
import { harborDayMix, harborSpriteDirection } from '../lib/harbor-renderer';

describe('registered harbor view', () => {
  it('registers every runway and coast anchor exactly without folded mesh triangles', () => {
    expect(harborMesh.length).toBeGreaterThan(20);
    for (const anchor of harborAnchors) {
      const p = registerHarbor(anchor.source);
      expect(p[0]).toBeCloseTo(anchor.target[0], 6);
      expect(p[1]).toBeCloseTo(anchor.target[1], 6);
    }
    const area = (a: number[], b: number[], c: number[]) =>
      (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    for (const t of harborMesh) {
      const [a, b, c] = t.map((i) => harborAnchors[i]);
      expect(
        area(a.source, b.source, c.source) * area(a.target, b.target, c.target),
      ).toBeGreaterThan(0);
    }
    for (const runway of harborRunways) {
      expect(projectHarbor(...runway.start)[0]).toBeCloseTo(
        runway.artStart[0],
        5,
      );
      expect(projectHarbor(...runway.end)[1]).toBeCloseTo(runway.artEnd[1], 5);
    }
  });
  it('is continuous across mesh boundaries and keeps faraway positions outside', () => {
    for (const anchor of harborAnchors.slice(4)) {
      const a = registerHarbor([anchor.source[0] - 0.001, anchor.source[1]]);
      const b = registerHarbor([anchor.source[0] + 0.001, anchor.source[1]]);
      expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeLessThan(0.01);
    }
    expect(projectHarbor(-72, 43)).toEqual(harborGuide(-72, 43));
  });
  it('maps compass headings through the oblique projection rather than rotating a flat map', () => {
    expect(harborHeading(-71.01, 42.36, 0)).toBeGreaterThan(15);
    expect(harborHeading(-71.01, 42.36, 90)).toBeGreaterThan(90);
  });
  it('aligns both directions of every runway with the painted centerline and authored sprite', () => {
    for (const runway of harborRunways) {
      for (const forward of [true, false]) {
        const a = forward ? runway.start : runway.end;
        const b = forward ? runway.end : runway.start;
        const artA = forward ? runway.artStart : runway.artEnd;
        const artB = forward ? runway.artEnd : runway.artStart;
        const dx = artB[0] - artA[0],
          dy = artB[1] - artA[1];
        const artBearing = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
        for (let t = 0.05; t < 1; t += 0.05) {
          const lon = a[0] + (b[0] - a[0]) * t;
          const lat = a[1] + (b[1] - a[1]) * t;
          const bearing =
            ((Math.atan2(
              (b[0] - a[0]) * Math.cos((lat * Math.PI) / 180),
              b[1] - a[1],
            ) *
              180) /
              Math.PI +
              360) %
            360;
          const screenBearing = harborHeading(lon, lat, bearing);
          expect(
            Math.abs(((screenBearing - artBearing + 540) % 360) - 180),
          ).toBeLessThan(3);
          const direction = harborSpriteDirection(screenBearing);
          expect(
            Math.abs(((direction * 45 - artBearing + 540) % 360) - 180),
          ).toBeLessThan(25);
          const p = projectHarbor(lon, lat);
          expect(
            Math.abs(dx * (p[1] - artA[1]) - dy * (p[0] - artA[0])) /
              Math.hypot(dx, dy),
          ).toBeLessThan(3);
        }
      }
    }
  });
  it('counts quiet, normal, busy, outside-only and responsive-crop traffic honestly', () => {
    const frame = harborFrame(1920, 1080);
    expect(harborView(new Map(), now, frame)).toMatchObject({
      total: 0,
      outside: 0,
      feedTotal: 0,
    });
    for (const kind of ['normal', 'busy', 'outside'] as const) {
      const view = harborView(harborFixtureTracks(kind, now), now, frame);
      expect(view.total + view.outside).toBe(view.feedTotal);
      expect(view.inbound + view.outbound + view.ground + view.other).toBe(
        view.total,
      );
      if (kind === 'outside') expect(view.total).toBe(0);
    }
    const tracks = harborFixtureTracks('normal', now);
    expect(
      harborView(tracks, now, harborFrame(390, 844)).outside,
    ).toBeGreaterThan(harborView(tracks, now, frame).outside);
  });
  it('excludes expired and future reports and uses fading/interpolated real positions', () => {
    const tracks = harborFixtureTracks('normal', now + 10_000);
    expect(harborView(tracks, now - 1, harborFrame(1280, 720)).feedTotal).toBe(
      0,
    );
    expect(
      harborView(tracks, now + 70_000, harborFrame(1280, 720)).feedTotal,
    ).toBe(0);
    const track = tracks.values().next().value!;
    const a = sampleTrack(track, now + 25_000);
    const b = sampleTrack(track, now + 55_000);
    expect([a.lat, a.lon]).toEqual([b.lat, b.lon]);
    expect(b.opacity).toBe(0.5);
    const result = harborView(tracks, now + 12_500, harborFrame(1672, 941));
    const sampled = sampleTrack(track, now + 12_500);
    expect(result.aircraft[0].x).toBeCloseTo(
      projectHarbor(sampled.lon, sampled.lat)[0],
    );
  });
  it('uses the same smooth daylight endpoints as the story art', () => {
    expect(harborDayMix(0)).toBe(0);
    expect(harborDayMix(1)).toBe(1);
    expect(harborDayMix(0.5)).toBeCloseTo(0.5);
  });
});
