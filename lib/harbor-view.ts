import { airport } from './airport';
import type { Coordinate } from './geo';
import { flightDirection } from './flight-story';
import { sampleTrack } from './tracks';
import type { TrackHistory } from './types';
import type { ActivityKind } from './flight-activity';
import type { HarborPose } from './harbor-motion';

const map = airport.map;
export const HARBOR_WIDTH = map?.width ?? 1672;
export const HARBOR_HEIGHT = map?.height ?? 941;
type Point = [number, number];

/** The design guide's oblique projection, in the approved painting's pixels. */
export function harborGuide(lon: number, lat: number): Point {
  if (!map) return [0, 0];
  const p = map.projection;
  const east =
    (lon - map.origin.lon) *
    111320 *
    Math.cos((airport.center.lat * Math.PI) / 180);
  const north = (lat - map.origin.lat) * 111320;
  return [
    ((p.width / 2 + (p.a * east + p.b * north) * p.scale) * HARBOR_WIDTH) /
      p.width,
    ((p.height / 2 + (p.c * east + p.d * north) * p.scale) * HARBOR_HEIGHT) /
      p.height,
  ];
}
export const harborRunways = map?.runways ?? [];

function cross(a: Point, b: Point, c: Point) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}
function intersection(a: Point, b: Point, c: Point, d: Point): Point | null {
  const den = cross(
    [0, 0],
    [b[0] - a[0], b[1] - a[1]],
    [d[0] - c[0], d[1] - c[1]],
  );
  if (Math.abs(den) < 0.001) return null;
  const t =
    cross([0, 0], [c[0] - a[0], c[1] - a[1]], [d[0] - c[0], d[1] - c[1]]) / den;
  const u =
    cross([0, 0], [c[0] - a[0], c[1] - a[1]], [b[0] - a[0], b[1] - a[1]]) / den;
  return t > 0 && t < 1 && u > 0 && u < 1
    ? [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]
    : null;
}

export const harborAnchors: { source: Point; target: Point }[] = [
  // Perimeter and shoreline anchors keep the surrounding painting stationary.
  ...(map?.stationaryAnchors ?? []).map((p) => ({
    source: p as Point,
    target: p as Point,
  })),
  ...harborRunways.flatMap((r) => [
    { source: harborGuide(...r.start), target: r.artStart },
    { source: harborGuide(...r.end), target: r.artEnd },
  ]),
];
for (let i = 0; i < harborRunways.length; i++) {
  for (let j = i + 1; j < harborRunways.length; j++) {
    const a = harborRunways[i],
      b = harborRunways[j];
    const source = intersection(
      harborGuide(...a.start),
      harborGuide(...a.end),
      harborGuide(...b.start),
      harborGuide(...b.end),
    );
    const target = intersection(a.artStart, a.artEnd, b.artStart, b.artEnd);
    if (source && target) harborAnchors.push({ source, target });
  }
}

type Triangle = [number, number, number];
/** Small deterministic Bowyer-Watson mesh; computed once, no mapping library. */
function triangulate(points: Point[]): Triangle[] {
  const all: Point[] = [
    ...points,
    [-10000, -10000],
    [10000, -10000],
    [0, 10000],
  ];
  const n = points.length;
  let triangles: Triangle[] = [[n, n + 1, n + 2]];
  for (let p = 0; p < n; p++) {
    const bad = triangles.filter(([ia, ib, ic]) => {
      const [a, b, c] = [all[ia], all[ib], all[ic]].map(
        ([x, y]) => [x - all[p][0], y - all[p][1]] as Point,
      );
      const det =
        (a[0] ** 2 + a[1] ** 2) * (b[0] * c[1] - c[0] * b[1]) -
        (b[0] ** 2 + b[1] ** 2) * (a[0] * c[1] - c[0] * a[1]) +
        (c[0] ** 2 + c[1] ** 2) * (a[0] * b[1] - b[0] * a[1]);
      return det * Math.sign(cross(all[ia], all[ib], all[ic])) > 0.0001;
    });
    const edges = new Map<string, [number, number]>();
    for (const [a, b, c] of bad)
      for (const [u, v] of [
        [a, b],
        [b, c],
        [c, a],
      ]) {
        const key = [u, v].sort((x, y) => x - y).join(':');
        if (edges.has(key)) edges.delete(key);
        else edges.set(key, [u, v]);
      }
    triangles = triangles.filter((t) => !bad.includes(t));
    for (const [u, v] of edges.values()) triangles.push([u, v, p]);
  }
  return triangles.filter((t) => t.every((i) => i < n));
}
export const harborMesh = triangulate(harborAnchors.map((a) => a.source));

export function registerHarbor(point: Point, inverse = false): Point {
  for (const indices of harborMesh) {
    const [a, b, c] = indices.map(
      (i) => harborAnchors[i][inverse ? 'target' : 'source'],
    );
    const area = cross(a, b, c);
    const weights = [
      cross(point, b, c) / area,
      cross(a, point, c) / area,
      cross(a, b, point) / area,
    ];
    if (weights.every((w) => w >= -1e-8))
      return [0, 1].map((axis) =>
        indices.reduce(
          (sum, index, i) =>
            sum +
            weights[i] *
              harborAnchors[index][inverse ? 'source' : 'target'][axis],
          0,
        ),
      ) as Point;
  }
  return point; // Outside the painting remains outside; never clamp traffic.
}
export function projectHarbor(lon: number, lat: number): Point {
  return registerHarbor(harborGuide(lon, lat));
}
/** Inverse registration for measuring bounded presentation corrections in metres. */
export function unprojectHarbor(x: number, y: number): Coordinate {
  const p = registerHarbor([x, y], true);
  if (!map) return [airport.center.lon, airport.center.lat];
  const projection = map.projection;
  const { a, b, c, d, scale, width, height } = projection;
  const px = ((p[0] * width) / HARBOR_WIDTH - width / 2) / scale;
  const py = ((p[1] * height) / HARBOR_HEIGHT - height / 2) / scale;
  const determinant = a * d - b * c;
  const east = (d * px - b * py) / determinant;
  const north = (-c * px + a * py) / determinant;
  return [
    map.origin.lon +
      east / (111320 * Math.cos((airport.center.lat * Math.PI) / 180)),
    map.origin.lat + north / 111320,
  ];
}
export function harborHeading(lon: number, lat: number, heading: number) {
  const angle = (heading * Math.PI) / 180;
  const a = projectHarbor(lon, lat);
  const b = projectHarbor(
    lon + (Math.sin(angle) * 0.0001) / Math.cos((lat * Math.PI) / 180),
    lat + Math.cos(angle) * 0.0001,
  );
  return ((Math.atan2(b[0] - a[0], a[1] - b[1]) * 180) / Math.PI + 360) % 360;
}
export function harborFrame(width: number, height: number) {
  const scale = Math.max(width / HARBOR_WIDTH, height / HARBOR_HEIGHT);
  return {
    scale,
    x: (width - HARBOR_WIDTH * scale) / 2,
    y: (height - HARBOR_HEIGHT * scale) * 0.53,
    width,
    height,
  };
}
export type HarborFrame = ReturnType<typeof harborFrame>;
export function harborView(
  tracks: Map<string, TrackHistory>,
  now: number,
  frame: HarborFrame,
  reducedMotion = false,
  poses?: ReadonlyMap<string, HarborPose>,
) {
  const counts = {
    total: 0,
    inbound: 0,
    outbound: 0,
    ground: 0,
    other: 0,
    outside: 0,
    feedTotal: 0,
  };
  const aircraft = [];
  for (const [id, history] of tracks) {
    const age = now - history.current.observedAt;
    if (age < 0 || age >= 60_000) continue;
    const flight: HarborPose =
      poses?.get(id) ?? sampleTrack(history, now, reducedMotion);
    if (!Number.isFinite(flight.lon) || !Number.isFinite(flight.lat)) continue;
    const direction = flightDirection(history);
    const kind: ActivityKind =
      flight.onGround === true
        ? 'ground'
        : direction === 'arrival'
          ? 'inbound'
          : direction === 'departure'
            ? 'outbound'
            : 'other';
    const point =
      flight.surface?.point ?? projectHarbor(flight.lon, flight.lat);
    const x = frame.x + point[0] * frame.scale,
      y = frame.y + point[1] * frame.scale;
    const inView =
      point[0] >= 0 &&
      point[0] <= HARBOR_WIDTH &&
      point[1] >= 0 &&
      point[1] <= HARBOR_HEIGHT &&
      x >= 0 &&
      x <= frame.width &&
      y >= 0 &&
      y <= frame.height;
    counts.feedTotal++;
    if (inView) {
      counts.total++;
      counts[kind]++;
    } else counts.outside++;
    const heading = flight.heading ?? history.previous?.heading ?? null;
    aircraft.push({
      id,
      flight,
      kind,
      x,
      y,
      inView,
      heading:
        flight.surface?.heading ??
        (heading === null
          ? null
          : harborHeading(flight.lon, flight.lat, heading)),
      surfaceAligned: (flight.surface?.strength ?? 0) > 0.01,
    });
  }
  return { ...counts, aircraft };
}
export type HarborView = ReturnType<typeof harborView>;
