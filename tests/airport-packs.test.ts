import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { aep } from '../airports/aep';
import { boston } from '../airports/boston';
import { highland } from './fixtures/highland-airport';
import { defineAirport } from '../airports/types';
import type { AircraftTrack, TrackHistory } from '../lib/types';
import type { FlightRoute } from '../lib/flight-routes';
const now = Date.parse('2026-11-17T19:00:00Z');
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});
for (const pack of [boston, aep, highland])
  describe(`${pack.id} pack only`, () => {
    async function select() {
      vi.resetModules();
      vi.doMock('../airport.config', () => ({ default: pack }));
      const current: AircraftTrack = {
        id: 'abcdef',
        callsign: 'ARG123',
        registration: null,
        aircraftType: 'A320',
        lat: pack.center.lat,
        lon: pack.center.lon,
        altitudeFt: pack.elevationFt + 300,
        speedKt: 140,
        heading: 90,
        verticalRateFpm: -500,
        onGround: false,
        observedAt: now,
        airline: {
          name: 'Synthetic airline',
          code: 'ZZ',
          color: '#fff',
          sprite: 0,
        },
      };
      return { current, history: { current, previous: null } as TrackHistory };
    }
    it('configures both position providers, weather filtering, station and unavailable data', async () => {
      await select();
      const { trafficProviders } = await import('../lib/traffic/providers');
      expect(trafficProviders['adsb-lol'].url).toContain(
        `/point/${pack.center.lat}/${pack.center.lon}/${pack.radiusNm}`,
      );
      expect(trafficProviders['adsb-fi'].url).toContain(
        `/lat/${pack.center.lat}/lon/${pack.center.lon}/dist/${pack.radiusNm}`,
      );
      const { normalizeWeather, unavailableWeather } =
        await import('../lib/normalize');
      const records = [
        { icaoId: 'ZZZZ', obsTime: now / 1000, temp: 99 },
        {
          icaoId: pack.weatherStation,
          obsTime: now / 1000,
          temp: 18,
          wspd: 4,
          clouds: [],
        },
      ];
      expect(normalizeWeather(records, now)).toMatchObject({
        station: pack.weatherStation,
        temperatureC: 18,
        freshness: 'fresh',
      });
      expect(() => normalizeWeather([records[0]], now)).toThrow();
      expect(unavailableWeather('offline', 30).station).toBe(
        pack.weatherStation,
      );
      const fetcher = vi.fn().mockResolvedValue(Response.json(records));
      vi.stubGlobal('fetch', fetcher);
      const { GET } = await import('../app/api/weather/route');
      await GET();
      expect(fetcher.mock.calls[0][0]).toContain(`ids=${pack.weatherStation}&`);
    });
    it('centers geography and nearby selection locally and uses height above the airport', async () => {
      const { current, history } = await select();
      const { localMeters } = await import('../lib/geo');
      const { flightMoment } = await import('../lib/flight-story');
      const { nearbyMoments, validViewpoint } = await import('../lib/observer');
      expect(localMeters(pack.center.lon, pack.center.lat)).toEqual([0, 0]);
      expect(flightMoment(history, now)).toBe('landing');
      expect(validViewpoint(pack.center)).toBe(true);
      expect(validViewpoint({ lat: 0, lon: 0 })).toBe(false);
      expect(
        nearbyMoments(new Map([[current.id, history]]), pack.center, now),
      ).toHaveLength(1);
      const high = {
        ...history,
        current: { ...current, altitudeFt: pack.elevationFt + 6001 },
      };
      expect(
        nearbyMoments(new Map([[current.id, high]]), pack.center, now),
      ).toHaveLength(0);
      expect(
        flightMoment(
          { ...history, current: { ...current, observedAt: now - 61000 } },
          now,
        ),
      ).toBeNull();
    });
    it('uses local daylight, time zone, route identity and globe origin', async () => {
      const { current } = await select();
      const { daylight, airportTime } = await import('../lib/daylight');
      const { getTimes } = await import('suncalc');
      expect(daylight(now).sunrise).toBe(
        getTimes(
          new Date(now),
          pack.center.lat,
          pack.center.lon,
        ).sunrise?.getTime(),
      );
      expect(airportTime(now)).toBe(
        new Intl.DateTimeFormat('en-US', {
          timeZone: pack.timeZone,
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }).format(now),
      );
      const home = {
        icao: pack.icao,
        code: pack.iata,
        city: pack.city,
        country: pack.country,
        ...pack.center,
      };
      const remote = {
        icao: 'EGLL',
        code: 'LHR',
        city: 'London',
        country: 'United Kingdom',
        lat: 51.47,
        lon: -0.454,
      };
      const route = {
        origin: home,
        destination: remote,
        callsign: current.callsign,
        aircraftId: current.id,
        observedAt: now,
      } as unknown as FlightRoute;
      const { routeForMoment } = await import('../lib/flight-routes');
      const { remoteAirport } = await import('../components/arcade-globe');
      expect(routeForMoment(route, 'climb')).toBe(route);
      expect(routeForMoment(route, 'approach')).toBeNull();
      expect(remoteAirport(route)).toBe(remote);
      const unrelated = { ...route, origin: { ...home, icao: 'ZZZZ' } };
      expect(routeForMoment(unrelated, 'climb')).toBeNull();
    });
    it('paces optional paid routes using the selected time zone', async () => {
      await select();
      const { airportRoutePacing } = await import('../lib/route-budget');
      const pacing = airportRoutePacing(
        {
          start: now - 86400000,
          end: now + 86400000,
          credits: 1000,
          dailyCredits: 100,
          cacheMs: 300000,
          negativeCacheMs: 300000,
          usualCacheMs: 300000,
          burstCredits: 10,
        },
        0,
        now,
      );
      const hour = new Intl.DateTimeFormat('en-US', {
        timeZone: pack.timeZone,
        hour: '2-digit',
        hourCycle: 'h23',
      });
      expect(hour.format(pacing.morningStart)).toBe('08');
      expect(pacing.block).toBe(
        pack.id === 'test-highland' ? 'overnight' : 'daytime',
      );
    });
    it('supplies complete local artwork and declares optional capabilities explicitly', async () => {
      await select();
      for (const art of Object.values(pack.scenes))
        for (const url of [art.day, art.night])
          expect(existsSync(resolve('public', url.slice(1))), url).toBe(true);
      const { hasAirportMap, airportCacheKey } = await import('../lib/airport');
      const { HAS_TOWER } = await import('../lib/radio');
      expect(hasAirportMap).toBe(Boolean(pack.map));
      expect(HAS_TOWER).toBe(Boolean(pack.tower));
      expect(airportCacheKey).toContain(
        `${pack.id}:${pack.icao}:${pack.center.lat}`,
      );
    });
  });
it('rejects incomplete packs and unsafe public tower URLs early', () => {
  expect(() => defineAirport({ ...aep, timeZone: 'invalid' })).toThrow();
  expect(() => defineAirport({ ...aep, radiusNm: 0 })).toThrow();
  expect(() =>
    defineAirport({
      ...aep,
      scenes: { ...aep.scenes, taxi: { day: '', night: '' } },
    }),
  ).toThrow();
  expect(() =>
    defineAirport({
      ...aep,
      tower: {
        streamUrl: 'https://user:secret@example.com/audio',
        playerUrl: 'https://example.com',
        label: 'Test',
      },
    }),
  ).toThrow();
});
