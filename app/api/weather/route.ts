import { airport } from '@/lib/airport';
import { createFeedCache } from '@/lib/feed-cache';
import {
  normalizeWeather,
  unavailableWeather,
  WEATHER_STALE_MS,
} from '@/lib/normalize';
const getWeather = createFeedCache({
  url: `https://aviationweather.gov/api/data/metar?ids=${airport.weatherStation}&format=json`,
  ttl: 300_000,
  staleAfter: WEATHER_STALE_MS,
  normalize: normalizeWeather,
  unavailable: unavailableWeather,
});
export async function GET() {
  const data = await getWeather();
  return Response.json(data, {
    status: data.freshness === 'unavailable' ? 503 : 200,
    headers: {
      'Cache-Control': 'no-store',
      ...(data.retryAfterSeconds
        ? { 'Retry-After': String(data.retryAfterSeconds) }
        : {}),
    },
  });
}
