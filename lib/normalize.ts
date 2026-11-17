import { airport } from './airport';
import { identifyAirline } from './airlines';
import { TRAFFIC_SOURCES, type TrafficSourceId } from './traffic-sources';
import type { AircraftTrack, TrafficSnapshot, WeatherSnapshot } from './types';
export const TRAFFIC_STALE_MS = 30_000;
export const WEATHER_STALE_MS = 90 * 60_000;
const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;
const text = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, 120) : null;
export const ageMs = (observedAt: number | null, now = Date.now()) =>
  observedAt === null ? Infinity : Math.max(0, now - observedAt);
export function normalizeTraffic(
  raw: unknown,
  receivedAt = Date.now(),
  provider: TrafficSourceId = 'adsb-lol',
): TrafficSnapshot {
  if (!raw || typeof raw !== 'object')
    throw new Error('Invalid traffic response');
  const body = raw as Record<string, unknown>;
  if (!Array.isArray(body.ac) || num(body.now) === null)
    throw new Error('Invalid traffic response');
  const sourceTime =
    Number(body.now) > 1e12 ? Number(body.now) : Number(body.now) * 1000;
  if (sourceTime > receivedAt + 60_000 || sourceTime <= 0)
    throw new Error('Invalid traffic timestamp');
  const aircraft: AircraftTrack[] = [];
  for (const value of body.ac) {
    if (!value || typeof value !== 'object') continue;
    const a = value as Record<string, unknown>;
    const lat = num(a.lat),
      lon = num(a.lon),
      seen = num(a.seen_pos),
      id = text(a.hex);
    if (
      lat === null ||
      lon === null ||
      Math.abs(lat) > 90 ||
      Math.abs(lon) > 180 ||
      seen === null ||
      seen < 0 ||
      !id ||
      !/^~?[\da-f]{6}$/i.test(id)
    )
      continue;
    if (
      (typeof a.category === 'string' && a.category.startsWith('C')) ||
      a.t === 'GRND'
    )
      continue;
    const observedAt = Math.min(receivedAt, sourceTime - seen * 1000);
    if (ageMs(observedAt, receivedAt) >= 60_000) continue;
    const callsign = text(a.flight),
      heading = num(a.track),
      speed = num(a.gs);
    aircraft.push({
      positionSource: provider,
      id: id.toLowerCase(),
      callsign,
      registration: text(a.r),
      aircraftType: text(a.t),
      lat,
      lon,
      altitudeFt:
        a.alt_baro === 'ground' ? 0 : (num(a.alt_baro) ?? num(a.alt_geom)),
      speedKt: speed === null ? null : Math.max(0, speed),
      heading: heading === null ? null : ((heading % 360) + 360) % 360,
      verticalRateFpm: num(a.baro_rate) ?? num(a.geom_rate),
      onGround:
        a.alt_baro === 'ground'
          ? true
          : num(a.alt_baro) !== null || num(a.alt_geom) !== null
            ? false
            : null,
      observedAt,
      airline: identifyAirline(callsign),
    });
  }
  return {
    source: TRAFFIC_SOURCES[provider].name,
    provider,
    observedAt: sourceTime,
    receivedAt,
    freshness:
      ageMs(sourceTime, receivedAt) > TRAFFIC_STALE_MS ? 'stale' : 'fresh',
    error: null,
    retryAfterSeconds: null,
    aircraft,
  };
}
const coverAmount: Record<string, number> = {
  CLR: 0,
  SKC: 0,
  NSC: 0,
  NCD: 0,
  FEW: 0.16,
  SCT: 0.38,
  BKN: 0.76,
  OVC: 1,
  VV: 1,
};
function visibility(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 ? v : null;
  if (typeof v !== 'string') return null;
  const s = v.replace('+', '').trim();
  if (!s) return null;
  const parts = s.split(/\s+/);
  let result = 0;
  for (const p of parts) {
    if (p.includes('/')) {
      const [a, b] = p.split('/').map(Number);
      if (!b || !Number.isFinite(a)) return null;
      result += a / b;
    } else {
      const n = Number(p);
      if (!Number.isFinite(n)) return null;
      result += n;
    }
  }
  return result >= 0 ? result : null;
}
export function normalizeWeather(
  raw: unknown,
  receivedAt = Date.now(),
): WeatherSnapshot {
  if (!Array.isArray(raw)) throw new Error('Invalid weather response');
  const m = raw
    .filter(
      (v) =>
        v && v.icaoId === airport.weatherStation && num(v.obsTime) !== null,
    )
    .sort((a, b) => b.obsTime - a.obsTime)[0];
  if (!m) throw new Error(`No recent ${airport.name} weather report`);
  const observedAt = m.obsTime * 1000;
  if (observedAt > receivedAt + 60_000 || observedAt <= 0)
    throw new Error('Invalid weather timestamp');
  const rawText =
    typeof m.rawOb === 'string' ? m.rawOb.trim().slice(0, 600) : null;
  const tokens = String(m.rawOb ?? '')
    .split(' RMK ')[0]
    .split(/\s+/)
    .filter((t) =>
      /^[+-]?(?:VC)?(?:MI|BC|PR|DR|BL|SH|TS|FZ)?(?:DZ|RA|SN|SG|IC|PL|GR|GS|UP|BR|FG|FU|VA|DU|SA|HZ|PY|PO|SQ|FC|SS|DS)+$/.test(
        t,
      ),
    );
  const wx: string =
    typeof m.wxString === 'string' && m.wxString.trim()
      ? m.wxString
      : tokens.join(' ');
  const weatherCodes = wx.split(/\s+/).filter(Boolean);
  const rain = /RA/.test(wx);
  const drizzle = /DZ/.test(wx);
  const snow = /SN|SG|PL|IC/.test(wx);
  const precipitation =
    snow && (rain || drizzle)
      ? 'mixed'
      : snow
        ? 'snow'
        : rain
          ? 'rain'
          : drizzle
            ? 'drizzle'
            : null;
  const precipitationCode = weatherCodes.find((code) =>
    /RA|DZ|SN|SG|PL|IC/.test(code),
  );
  const precipitationIntensity = precipitationCode
    ? precipitationCode.startsWith('-')
      ? 'light'
      : precipitationCode.startsWith('+')
        ? 'heavy'
        : 'moderate'
    : null;
  const thunder = weatherCodes.some(
    (code) => code.includes('TS') && !code.startsWith('VC'),
  );
  const miles = visibility(m.visib);
  const fog = weatherCodes.some(
    (code) => code.includes('FG') && !code.startsWith('VC'),
  );
  const mist = weatherCodes.some((code) => code.includes('BR'));
  const covers = Array.isArray(m.clouds)
    ? m.clouds
        .map((c: { cover: string } | null) =>
          c ? coverAmount[c.cover] : undefined,
        )
        .filter((v: unknown) => typeof v === 'number')
    : [];
  const cloudCover = covers.length
    ? Math.max(...covers)
    : (coverAmount[m.cover] ?? null);
  const ceilingFt = Array.isArray(m.clouds)
    ? Math.min(
        ...m.clouds
          .filter(
            (cloud: { cover?: string } | null) =>
              cloud && ['BKN', 'OVC', 'VV'].includes(cloud.cover ?? ''),
          )
          .map((cloud: { base?: unknown }) => num(cloud.base))
          .filter((base: number | null): base is number => base !== null),
      )
    : Infinity;
  const condition =
    (precipitation === 'mixed' || precipitation === 'drizzle'
      ? 'rain'
      : precipitation) ??
    (fog || mist
      ? 'fog'
      : cloudCover === null
        ? 'unknown'
        : cloudCover >= 0.38
          ? 'cloudy'
          : 'clear');
  const obscuration = fog ? 'fog' : mist ? 'mist' : null;
  const precipitationLabel =
    precipitationIntensity === 'light'
      ? 'Light rain'
      : precipitationIntensity === 'heavy'
        ? 'Heavy rain'
        : 'Rain';
  let description: string;
  if (precipitation === 'mixed') description = 'Rain and snow';
  else if (precipitation === 'snow') description = 'Snow';
  else if (precipitation === 'drizzle') description = 'Drizzle';
  else if (precipitation === 'rain')
    description = thunder ? 'Thunderstorms' : precipitationLabel;
  else if (fog) description = 'Fog';
  else if (mist) description = 'Mist';
  else if (cloudCover === null) description = 'Conditions unavailable';
  else if (cloudCover >= 0.95) description = 'Overcast';
  else if (cloudCover >= 0.7) description = 'Mostly cloudy';
  else if (cloudCover >= 0.3) description = 'Partly cloudy';
  else if (cloudCover > 0) description = 'Mostly clear';
  else description = 'Clear skies';
  const fullDescription =
    precipitation && obscuration
      ? `${description} · ${obscuration}`
      : description;
  return {
    station: airport.weatherStation,
    source: 'NOAA Aviation Weather Center',
    observedAt,
    receivedAt,
    freshness:
      ageMs(observedAt, receivedAt) > WEATHER_STALE_MS ? 'stale' : 'fresh',
    error: null,
    retryAfterSeconds: null,
    temperatureC: num(m.temp),
    dewPointC: num(m.dewp),
    windDirection: num(m.wdir),
    windSpeedKt: num(m.wspd),
    windGustKt: num(m.wgst),
    visibilityMiles: miles,
    cloudCover,
    ceilingFt: Number.isFinite(ceilingFt) ? ceilingFt : null,
    condition,
    precipitation,
    precipitationIntensity,
    fog,
    mist,
    thunder,
    description: fullDescription,
    raw: rawText,
  };
}
export function unavailableTraffic(
  error: string,
  retryAfterSeconds: number,
  provider?: TrafficSourceId,
): TrafficSnapshot {
  return {
    source: provider ? TRAFFIC_SOURCES[provider].name : 'Aircraft positions',
    ...(provider ? { provider } : {}),
    observedAt: null,
    receivedAt: null,
    freshness: 'unavailable',
    error,
    retryAfterSeconds,
    aircraft: [],
  };
}
export function unavailableWeather(
  error: string,
  retryAfterSeconds: number,
): WeatherSnapshot {
  return {
    station: airport.weatherStation,
    source: 'NOAA Aviation Weather Center',
    observedAt: null,
    receivedAt: null,
    freshness: 'unavailable',
    error,
    retryAfterSeconds,
    temperatureC: null,
    dewPointC: null,
    windDirection: null,
    windSpeedKt: null,
    windGustKt: null,
    visibilityMiles: null,
    cloudCover: null,
    ceilingFt: null,
    condition: 'unknown',
    precipitation: null,
    precipitationIntensity: null,
    fog: false,
    mist: false,
    thunder: false,
    description: 'Weather unavailable',
    raw: null,
  };
}
