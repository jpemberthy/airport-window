import { getRouteDatabase } from '@/db';
import { airport } from '@/lib/airport';
export async function GET() {
  try {
    const db = getRouteDatabase();
    await db?.prepare('SELECT 1').first();
    if (!db) throw new Error('Database unavailable');
    return Response.json({ status: 'ok', airport: airport.icao });
  } catch {
    return Response.json({ status: 'unavailable' }, { status: 503 });
  }
}
