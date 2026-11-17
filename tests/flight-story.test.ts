import { describe, expect, it } from 'vitest';
import {
  flightDirection,
  flightMoment,
  flightName,
  liveMoments,
  nearbyFlights,
} from '../lib/flight-story';
import { identifyAirline } from '../lib/airlines';
import { mergeTracks } from '../lib/tracks';
import type { AircraftTrack, TrackHistory } from '../lib/types';

const observedAt = 1_000_000;
function track(overrides: Partial<AircraftTrack> = {}): AircraftTrack {
  return {
    id: 'abc123',
    callsign: 'DAL324',
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
const history = (
  current: AircraftTrack,
  previous: AircraftTrack | null = null,
): TrackHistory => ({ current, previous });

describe('flight cards use only observed movement', () => {
  it('names a flight from its callsign and operator', () => {
    expect(flightName(track())).toBe('Delta 324');
    expect(flightName(track({ callsign: null, registration: 'N123AB' }))).toBe(
      'N123AB',
    );
  });
  it('classifies clear climbs and descents without claiming a route', () => {
    expect(flightDirection(history(track()))).toBe('arrival');
    expect(flightDirection(history(track({ verticalRateFpm: 600 })))).toBe(
      'departure',
    );
    expect(flightDirection(history(track({ onGround: true })))).toBeNull();
    expect(flightDirection(history(track({ altitudeFt: 17000 })))).toBeNull();
  });
  it('uses movement toward or away from Logan only when change is meaningful', () => {
    const level = track({ verticalRateFpm: 0 });
    expect(
      flightDirection(
        history(level, track({ lat: 42.45, observedAt: observedAt - 5000 })),
      ),
    ).toBe('arrival');
    expect(
      flightDirection(
        history(level, track({ lat: 42.37, observedAt: observedAt - 5000 })),
      ),
    ).toBe('departure');
    expect(flightDirection(history(level))).toBeNull();
  });
  it('hides old positions from the live cards', () => {
    const tracks = new Map<string, TrackHistory>([
      ['old', history(track({ id: 'old', observedAt: observedAt - 61000 }))],
      ['new', history(track({ id: 'new' }))],
    ]);
    expect(
      nearbyFlights(tracks, 'arrival', observedAt).map((flight) => flight.id),
    ).toEqual(['new']);
  });
  it('distinguishes approach, taxi, takeoff, and climb from live movement', () => {
    expect(flightMoment(history(track()), observedAt)).toBe('approach');
    expect(flightMoment(history(track({ altitudeFt: 250 })), observedAt)).toBe(
      'landing',
    );
    expect(
      flightMoment(history(track({ onGround: true, speedKt: 16 })), observedAt),
    ).toBe('taxi');
    expect(
      flightMoment(
        history(track({ altitudeFt: 650, verticalRateFpm: 700 })),
        observedAt,
      ),
    ).toBe('takeoff');
    expect(
      flightMoment(
        history(track({ altitudeFt: 3200, verticalRateFpm: 700 })),
        observedAt,
      ),
    ).toBe('climb');
  });
  it('holds observed ground transitions long enough to show landing and liftoff', () => {
    const airborne = track({ altitudeFt: 150, speedKt: 130 });
    const touchdown = track({
      onGround: true,
      altitudeFt: 0,
      speedKt: 85,
      observedAt: observedAt + 5000,
    });
    const landingTracks = mergeTracks(
      mergeTracks(new Map(), [airborne], observedAt),
      [touchdown],
      observedAt + 5000,
    );
    const landing = landingTracks.get(airborne.id)!;
    expect(flightMoment(landing, observedAt + 20_000)).toBe('landing');
    const taxiTracks = mergeTracks(
      landingTracks,
      [{ ...touchdown, speedKt: 18, observedAt: observedAt + 25_000 }],
      observedAt + 25_000,
    );
    expect(
      flightMoment(taxiTracks.get(airborne.id)!, observedAt + 28_000),
    ).toBe('taxi');

    const takeoffTracks = mergeTracks(
      mergeTracks(
        new Map(),
        [track({ onGround: true, speedKt: 105 })],
        observedAt,
      ),
      [
        track({
          altitudeFt: 200,
          verticalRateFpm: 900,
          observedAt: observedAt + 5000,
        }),
      ],
      observedAt + 5000,
    );
    expect(
      flightMoment(takeoffTracks.get(airborne.id)!, observedAt + 20_000),
    ).toBe('takeoff');
  });
  it('does not drop a touchdown just because the clock moved', () => {
    const airborne = track({ altitudeFt: 150, speedKt: 130 });
    const touchdown = track({
      onGround: true,
      altitudeFt: 0,
      speedKt: 80,
      observedAt: observedAt + 5000,
    });
    const tracks = mergeTracks(
      mergeTracks(new Map(), [airborne], observedAt),
      [touchdown],
      observedAt + 5000,
    );
    const landed = tracks.get(airborne.id)!;
    expect(flightMoment(landed, observedAt + 5000)).toBe('landing');
    expect(flightMoment(landed, observedAt + 30_000)).toBe('landing');
  });
  it('interleaves live moments instead of letting one phase dominate', () => {
    const tracks = new Map<string, TrackHistory>([
      ['a', history(track({ id: 'a' }))],
      ['b', history(track({ id: 'b', lat: 42.4 }))],
      ['t', history(track({ id: 't', onGround: true, speedKt: 15 }))],
    ]);
    expect(liveMoments(tracks, observedAt).map(({ moment }) => moment)).toEqual(
      ['approach', 'taxi', 'approach'],
    );
  });
});
