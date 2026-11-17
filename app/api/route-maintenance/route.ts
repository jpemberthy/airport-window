import { getRouteDatabase } from '@/db';
import { RouteStore } from '@/lib/route-budget';

export async function POST(request: Request) {
  const token = process.env.ROUTE_MAINTENANCE_TOKEN;
  if (!token || request.headers.get('Authorization') !== `Bearer ${token}`)
    return new Response(null, { status: 404 });
  const db = getRouteDatabase();
  if (!db) return new Response(null, { status: 503 });
  await new RouteStore(db).prune(Date.now());
  return new Response(null, { status: 204 });
}
