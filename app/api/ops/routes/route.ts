import { getRouteDatabase } from '@/db';
import { routeOpsSnapshot, unavailableRouteOpsSnapshot } from '@/lib/route-ops';

const headers = { 'Cache-Control': 'no-store' };

export async function GET() {
  if (process.env.AIRPORT_OPS_DASHBOARD_ENABLED !== 'true')
    return Response.json({ error: 'Not found' }, { status: 404, headers });

  const now = Date.now();
  try {
    const db = getRouteDatabase();
    if (!db)
      return Response.json(unavailableRouteOpsSnapshot(now), {
        status: 503,
        headers,
      });
    return Response.json(
      await routeOpsSnapshot(
        db,
        { ...process.env, NODE_ENV: process.env.NODE_ENV },
        now,
      ),
      { headers },
    );
  } catch {
    return Response.json(unavailableRouteOpsSnapshot(now), {
      status: 503,
      headers,
    });
  }
}
