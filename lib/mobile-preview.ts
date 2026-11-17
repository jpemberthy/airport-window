import { identifyAirline } from './airlines';
import { atmosphereProfile } from './atmosphere';
import type { FlightRoute, RouteAirport } from './flight-routes';
import { MOMENT_ORDER, type LiveMoment } from './flight-story';
import { unavailableWeather } from './normalize';
import type { AircraftTrack } from './types';

// Deliberately static, synthetic examples. No live hooks, persistence, or providers.
export const PREVIEW_NOW = Date.parse('2026-10-13T22:45:00Z');
export const PREVIEW_SCENARIOS = {
  normal: 'Typical flight',
  'long-name': 'Long airline name',
  'no-route': 'Missing route',
  nearby: 'Nearby activity',
  quiet: 'No flights',
  stale: 'Stale positions',
} as const;
export type PreviewScenario = keyof typeof PREVIEW_SCENARIOS;

const boston: RouteAirport = {
  icao: 'KBOS',
  code: 'BOS',
  city: 'Boston',
  country: 'United States',
  lat: 42.364,
  lon: -71.009,
};
const airports: RouteAirport[] = [
  {
    icao: 'LPPT',
    code: 'LIS',
    city: 'Lisbon',
    country: 'Portugal',
    lat: 38.774,
    lon: -9.135,
  },
  {
    icao: 'KSRQ',
    code: 'SRQ',
    city: 'Sarasota',
    country: 'United States',
    lat: 27.395,
    lon: -82.554,
  },
  {
    icao: 'KLGA',
    code: 'LGA',
    city: 'New York',
    country: 'United States',
    lat: 40.777,
    lon: -73.873,
  },
  {
    icao: 'EDDF',
    code: 'FRA',
    city: 'Frankfurt',
    country: 'Germany',
    lat: 50.033,
    lon: 8.57,
  },
  {
    icao: 'LSZH',
    code: 'ZRH',
    city: 'Zurich',
    country: 'Switzerland',
    lat: 47.458,
    lon: 8.556,
  },
];
const callsigns = ['TAP217', 'JBU152', 'RPA4724', 'DLH423', 'SWR53'];
const flightNumbers = ['TP217', 'B6152', 'AA4724', 'LH423', 'LX53'];
const aircraftTypes = ['A321', 'BCS3', 'E170', 'A346', 'A333'];
const altitudes = [2100, 175, 0, 425, 3200];
const speeds = [170, 132, 18, 156, 235];

export function mobilePreview(
  scenario: PreviewScenario,
  index: number,
  daytime: boolean,
) {
  const weather = {
    ...unavailableWeather('', PREVIEW_NOW),
    source: 'Synthetic preview',
    freshness: 'fresh' as const,
    observedAt: PREVIEW_NOW - 12 * 60_000,
    receivedAt: PREVIEW_NOW,
    temperatureC: 14.4,
    windSpeedKt: 3,
    cloudCover: 0.35,
    condition: 'cloudy' as const,
    description: 'Partly cloudy',
  };
  const moments: LiveMoment[] = MOMENT_ORDER.map((moment, i) => {
    const flight: AircraftTrack = {
      id: `preview-${i}`,
      callsign: callsigns[i],
      registration: null,
      aircraftType: aircraftTypes[i],
      lat: 42.38,
      lon: -71.02,
      altitudeFt: altitudes[i],
      speedKt: speeds[i],
      heading: 180,
      verticalRateFpm: i < 2 ? -500 : i === 2 ? 0 : 1000,
      onGround: moment === 'taxi',
      observedAt: PREVIEW_NOW - (scenario === 'stale' ? 120_000 : 3000),
      airline:
        scenario === 'long-name'
          ? {
              ...identifyAirline('RPA4724'),
              name: 'Republic Airways for American Airlines',
            }
          : identifyAirline(callsigns[i]),
    };
    return { flight, moment };
  });
  const featured = scenario === 'quiet' ? null : moments[index];
  const route: FlightRoute | null =
    featured && scenario !== 'no-route'
      ? {
          verification: 'exact',
          aircraftId: featured.flight.id,
          callsign: callsigns[index],
          flightNumber: flightNumbers[index],
          origin: index >= 3 ? boston : airports[index],
          destination: index >= 3 ? airports[index] : boston,
        }
      : null;
  return {
    featured,
    route,
    moments: featured ? moments : [],
    weather,
    atmosphere: atmosphereProfile(weather, daytime ? 1 : 0.12, PREVIEW_NOW),
  };
}
