import { describe, it, expect } from 'vitest';
import {
  normalizeTraffic,
  normalizeWeather,
  WEATHER_STALE_MS,
} from '../lib/normalize';
import { identifyAirline } from '../lib/airlines';
const now = Date.parse('2026-09-07T18:00:00Z');
const plane = {
  hex: 'abc123',
  lat: 42.36,
  lon: -71.01,
  flight: 'JBU123 ',
  seen_pos: 2.5,
  alt_baro: 1200,
  gs: 135,
  track: 355,
  t: 'A320',
};
const metar = {
  icaoId: 'KBOS',
  obsTime: now / 1000 - 300,
  temp: 20,
  wdir: 240,
  wspd: 12,
  visib: '10+',
  clouds: [{ cover: 'CLR' }],
  rawOb: 'KBOS 071755Z 24012KT 10SM CLR 20/12 A3001',
};
describe('reported positions', () => {
  it('normalizes source milliseconds and nullable measurements', () => {
    const s = normalizeTraffic(
      {
        now,
        ac: [
          plane,
          {
            ...plane,
            hex: 'def456',
            flight: null,
            alt_baro: undefined,
            track: undefined,
            gs: undefined,
          },
        ],
      },
      now,
    );
    expect(s.aircraft[0]).toMatchObject({
      callsign: 'JBU123',
      observedAt: now - 2500,
      altitudeFt: 1200,
      onGround: false,
      airline: { name: 'jetBlue' },
    });
    expect(s.aircraft[1]).toMatchObject({
      heading: null,
      speedKt: null,
      altitudeFt: null,
      onGround: null,
    });
  });
  it('accepts seconds timestamps and real empty traffic', () => {
    expect(normalizeTraffic({ now: now / 1000, ac: [] }, now)).toMatchObject({
      freshness: 'fresh',
      aircraft: [],
    });
  });
  it('rejects missing, old and invalid positions, and airport vehicles', () => {
    const variants = [
      { lat: null },
      { lon: 999 },
      { seen_pos: null },
      { seen_pos: 60 },
      { seen_pos: -1 },
      { category: 'C2' },
      { t: 'GRND' },
      { hex: 'script' },
    ];
    expect(
      normalizeTraffic(
        { now, ac: variants.map((v) => ({ ...plane, ...v })) },
        now,
      ).aircraft,
    ).toHaveLength(0);
  });
  it('preserves ground status and wraps headings', () => {
    expect(
      normalizeTraffic(
        { now, ac: [{ ...plane, alt_baro: 'ground', track: 361 }] },
        now,
      ).aircraft[0],
    ).toMatchObject({ onGround: true, altitudeFt: 0, heading: 1 });
  });
  it('rejects malformed responses and future source time', () => {
    expect(() => normalizeTraffic({ ac: [] }, now)).toThrow();
    expect(() =>
      normalizeTraffic({ now: now + 70_000, ac: [] }, now),
    ).toThrow();
  });
  it('identifies known callsigns without guessing general aviation', () => {
    expect(identifyAirline(' dal123 ')).toMatchObject({
      name: 'Delta Air Lines',
      sprite: 1,
    });
    for (const name of ['N123AB', 'XYZ123', 'UAL', null])
      expect(identifyAirline(name).sprite).toBe(6);
  });
});
describe('Logan weather', () => {
  it.each([
    ['CLR', 0, 'clear'],
    ['SCT', 0.38, 'cloudy'],
    ['OVC', 1, 'cloudy'],
  ] as const)('maps %s cloud cover', (cover, cloudCover, condition) => {
    expect(
      normalizeWeather([{ ...metar, clouds: [{ cover }] }], now),
    ).toMatchObject({ cloudCover, condition });
  });
  it.each([
    ['-RA', 'rain', false, false],
    ['+SN', 'snow', false, false],
    ['FZRA BR', 'rain', false, true],
    ['FG', 'fog', true, false],
  ] as const)('maps %s conditions', (wxString, condition, fog, mist) => {
    expect(normalizeWeather([{ ...metar, wxString }], now)).toMatchObject({
      condition,
      fog,
      mist,
    });
  });
  it('retains light rain, mist, dew point, and the low ceiling together', () => {
    const report = normalizeWeather(
      [
        {
          ...metar,
          temp: 13.9,
          dewp: 13.3,
          wdir: 20,
          wspd: 17,
          visib: 4,
          wxString: '-RA BR',
          clouds: [
            { cover: 'BKN', base: 800 },
            { cover: 'OVC', base: 1900 },
          ],
        },
      ],
      now,
    );
    expect(report).toMatchObject({
      dewPointC: 13.3,
      visibilityMiles: 4,
      ceilingFt: 800,
      precipitationIntensity: 'light',
      fog: false,
      mist: true,
      description: 'Light rain · mist',
    });
  });
  it.each([
    ['-RA', 'rain', 'light', false],
    ['RA', 'rain', 'moderate', false],
    ['+TSRA', 'rain', 'heavy', true],
    ['-DZ', 'drizzle', 'light', false],
    ['SN', 'snow', 'moderate', false],
    ['RASN', 'mixed', 'moderate', false],
    ['VCTS', null, null, false],
  ] as const)(
    'separates %s precipitation from thunder',
    (wxString, precipitation, precipitationIntensity, thunder) => {
      expect(normalizeWeather([{ ...metar, wxString }], now)).toMatchObject({
        precipitation,
        precipitationIntensity,
        thunder,
      });
    },
  );
  it('takes the lowest broken or overcast layer as the ceiling', () => {
    expect(
      normalizeWeather(
        [
          {
            ...metar,
            clouds: [
              { cover: 'SCT', base: 700 },
              { cover: 'BKN', base: 1600 },
              { cover: 'OVC', base: 3200 },
            ],
          },
        ],
        now,
      ),
    ).toMatchObject({ ceilingFt: 1600, cloudCover: 1 });
  });
  it('parses fractional visibility and falls back to raw METAR weather', () => {
    const s = normalizeWeather(
      [
        {
          ...metar,
          visib: '1 1/2',
          wxString: '',
          rawOb:
            'KBOS 071755Z 12005KT 1 1/2SM -SN BKN008 M02/M03 A3010 RMK RAB01',
        },
      ],
      now,
    );
    expect(s.visibilityMiles).toBe(1.5);
    expect(s.precipitation).toBe('snow');
  });
  it('does not turn historical remarks into current rain', () => {
    expect(
      normalizeWeather(
        [{ ...metar, rawOb: metar.rawOb + ' RMK RAB01E15' }],
        now,
      ).precipitation,
    ).toBeNull();
  });
  it('handles missing measurements and null cloud entries', () => {
    expect(
      normalizeWeather(
        [{ icaoId: 'KBOS', obsTime: now / 1000, clouds: [null, {}] }],
        now,
      ),
    ).toMatchObject({
      temperatureC: null,
      windSpeedKt: null,
      visibilityMiles: null,
      cloudCover: null,
      condition: 'unknown',
    });
  });
  it('does not turn blank visibility into invented fog', () => {
    expect(normalizeWeather([{ ...metar, visib: '' }], now)).toMatchObject({
      visibilityMiles: null,
      fog: false,
    });
  });
  it('selects latest KBOS report and marks 90-minute weather stale', () => {
    const s = normalizeWeather(
      [
        { ...metar, obsTime: (now - WEATHER_STALE_MS - 1) / 1000 },
        { ...metar, icaoId: 'KJFK', obsTime: now / 1000 },
      ],
      now,
    );
    expect(s.freshness).toBe('stale');
  });
  it('rejects empty and future observations', () => {
    expect(() => normalizeWeather([], now)).toThrow();
    expect(() =>
      normalizeWeather([{ ...metar, obsTime: now / 1000 + 120 }], now),
    ).toThrow();
  });
});
