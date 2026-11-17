import { identifyAirline } from './airlines';
import { harborRunways, unprojectHarbor } from './harbor-view';
import { harborTaxiLanes } from './harbor-lanes';
import type { AircraftTrack, TrackHistory } from './types';

export type HarborTrafficFixture =
  | 'normal'
  | 'quiet'
  | 'busy'
  | 'outside'
  | 'stale';
export const HARBOR_FIXTURE_EPOCH = Date.parse('2026-10-22T22:42:00Z');
export type HarborMotionFixture =
  | 'steady'
  | 'delayed'
  | 'correction'
  | 'turns'
  | 'runways'
  | 'surface'
  | 'dropout';
/** Deterministic five-second reports, not an API or animated screen coordinates. */
export function harborFixtureTracks(
  kind: HarborTrafficFixture,
  now: number,
  motion: HarborMotionFixture = 'steady',
) {
  const result = new Map<string, TrackHistory>();
  if (kind === 'quiet') return result;
  let report =
    HARBOR_FIXTURE_EPOCH +
    Math.floor((now - HARBOR_FIXTURE_EPOCH) / 5000) * 5000;
  const elapsed = (now - HARBOR_FIXTURE_EPOCH) / 1000;
  if (motion === 'delayed') report -= (Math.floor(elapsed / 5) % 3) * 1000;
  if (motion === 'dropout' && elapsed % 60 >= 15 && elapsed % 60 < 40)
    report = HARBOR_FIXTURE_EPOCH + (Math.floor(elapsed / 60) * 60 + 15) * 1000;
  if (motion === 'correction')
    report =
      HARBOR_FIXTURE_EPOCH + Math.max(0, Math.floor((elapsed - 4) / 5)) * 5000;
  const runwayReview = motion === 'runways' && kind !== 'outside';
  const surfaceReview = motion === 'surface' && kind !== 'outside';
  const count =
    runwayReview || surfaceReview
      ? 3
      : kind === 'busy'
        ? 42
        : kind === 'outside'
          ? 6
          : 12;
  for (let i = 0; i < count; i++) {
    const ground = runwayReview ? i === 2 : i % 5 === 3;
    const outbound = i % 3 === 1;
    const make = (stamp: number) => {
      const elapsed = (stamp - HARBOR_FIXTURE_EPOCH) / 1000;
      if (surfaceReview) {
        let x: number, y: number;
        if (i === 2) {
          const r = harborRunways[1];
          const t = 0.2 + elapsed / 100;
          x = r.artStart[0] + (r.artEnd[0] - r.artStart[0]) * t + 4;
          y = r.artStart[1] + (r.artEnd[1] - r.artStart[1]) * t + 4;
        } else {
          const lane = harborTaxiLanes.find(
            (l) =>
              l.id === (i === 0 ? 'north-apron-outer' : 'runway09-parallel'),
          )!;
          let remaining = Math.max(0, elapsed + 5) * (i === 0 ? 1.4 : 1.8);
          [x, y] = lane.points[lane.points.length - 1];
          for (let j = 1; j < lane.points.length; j++) {
            const a = lane.points[j - 1],
              b = lane.points[j];
            const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
            if (remaining <= length) {
              x = a[0] + ((b[0] - a[0]) * remaining) / length;
              y = a[1] + ((b[1] - a[1]) * remaining) / length;
              break;
            }
            remaining -= length;
          }
          // Deliberate small registration error exercises alignment against
          // the same real renderer; reports still describe this actual path.
          x += 3;
          y += 3;
        }
        const [lon, lat] = unprojectHarbor(x, y);
        return { lon, lat };
      }
      if (runwayReview) {
        // Straight passes on 04R, 33L and 27. They leave the scene naturally;
        // no runway wrapping or instant reversal at the edge of the artwork.
        const runway = harborRunways[[1, 5, 2][i]];
        const north = (runway.end[1] - runway.start[1]) * 111_320;
        const east =
          (runway.end[0] - runway.start[0]) *
          111_320 *
          Math.cos((42.364 * Math.PI) / 180);
        const t =
          (i === 0 ? 0.15 : i === 1 ? 0.65 : 0.85) +
          ((i === 0 ? 1 : -1) * elapsed * (ground ? 6 : 50)) /
            Math.hypot(east, north);
        return {
          lat: runway.start[1] + (runway.end[1] - runway.start[1]) * t,
          lon: runway.start[0] + (runway.end[0] - runway.start[0]) * t,
        };
      }
      const radius =
        kind === 'outside' || i > count - 3
          ? 9 + i * 0.3
          : motion === 'turns' && i === 0
            ? 0.35
            : 0.8 + ((i * 0.57) % 2.8);
      const speed = (100 + (i % 35)) * 0.514444;
      // The correction scenario really decelerates: reported position, course and
      // speed agree; delayed delivery, not contradictory fixture fields, causes correction.
      const progress =
        motion === 'correction' && i === 0
          ? elapsed <= 0
            ? speed * elapsed
            : elapsed < 5
              ? speed * elapsed - ((speed - 28.5556) * elapsed ** 2) / 10
              : 200 + 28.5556 * (elapsed - 5)
          : speed * elapsed;
      const angle =
        (i * 137.508 * Math.PI) / 180 +
        ((outbound ? 1 : -1) * progress) / (radius * 1852);
      let lat = 42.364 + (Math.cos(angle) * radius) / 60;
      let lon =
        -71.009 +
        (Math.sin(angle) * radius) / (60 * Math.cos((42.364 * Math.PI) / 180));
      if (ground && kind !== 'outside') {
        const runway = harborRunways[i % harborRunways.length];
        const t = 0.5 + 0.3 * Math.sin(i * 0.11 + elapsed / 140);
        lat = runway.start[1] + (runway.end[1] - runway.start[1]) * t;
        lon = runway.start[0] + (runway.end[0] - runway.start[0]) * t;
      }
      return { lat, lon };
    };
    const makeTrack = (stamp: number): AircraftTrack => {
      const position = make(stamp);
      const next = make(stamp + 100);
      const north = ((next.lat - position.lat) * 111_320) / 0.1;
      const east =
        ((next.lon - position.lon) *
          111_320 *
          Math.cos((position.lat * Math.PI) / 180)) /
        0.1;
      const callsign =
        i === 0 ? 'JBU1267' : `${outbound ? 'DAL' : 'UAL'}${217 + i}`;
      return {
        id: `harbor-${i}`,
        callsign,
        registration: null,
        aircraftType: 'A320',
        ...position,
        altitudeFt: surfaceReview
          ? i === 2
            ? Math.max(0, (stamp - HARBOR_FIXTURE_EPOCH) / 1000 - 20) * 20
            : 0
          : ground
            ? 0
            : 1400 + i * 180,
        onGround: surfaceReview
          ? i !== 2 || stamp < HARBOR_FIXTURE_EPOCH + 20_000
          : ground,
        heading:
          Math.hypot(east, north) < 0.01
            ? null
            : ((Math.atan2(east, north) * 180) / Math.PI + 360) % 360,
        speedKt: Math.hypot(east, north) / 0.514444,
        verticalRateFpm: surfaceReview
          ? i === 2 && stamp >= HARBOR_FIXTURE_EPOCH + 20_000
            ? 1200
            : 0
          : ground
            ? 0
            : outbound
              ? 650
              : -500,
        observedAt: stamp - (kind === 'stale' ? 45_000 : 0),
        airline: identifyAirline(callsign),
      };
    };
    result.set(`harbor-${i}`, {
      current: makeTrack(report),
      previous: makeTrack(report - 5000),
    });
  }
  return result;
}
