import { getTraffic } from '@/lib/traffic-feed';
export async function GET() {
  const data = await getTraffic();
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
