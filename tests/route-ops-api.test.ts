import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db', () => ({ getRouteDatabase: vi.fn() }));
import { getRouteDatabase } from '../db';
import { GET } from '../app/api/ops/routes/route';
import { testDatabase } from './d1-fixture';

let database: ReturnType<typeof testDatabase> | null = null;

afterEach(() => {
  database?.sqlite.close();
  database = null;
  vi.unstubAllEnvs();
});

describe('private route operations API', () => {
  it('is a no-store 404 unless explicitly enabled', async () => {
    const response = await GET();
    expect(response.status).toBe(404);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(getRouteDatabase).not.toHaveBeenCalled();
  });

  it('returns a sanitized storage status without a database', async () => {
    vi.stubEnv('AIRPORT_OPS_DASHBOARD_ENABLED', 'true');
    vi.mocked(getRouteDatabase).mockReturnValue(null);
    const response = await GET();
    expect(response.status).toBe(503);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toMatchObject({
      newLookupStatus: { state: 'storage-unavailable' },
    });
  });

  it('returns an empty, non-cacheable snapshot when enabled', async () => {
    vi.stubEnv('AIRPORT_OPS_DASHBOARD_ENABLED', 'true');
    database = testDatabase();
    vi.mocked(getRouteDatabase).mockReturnValue(database.db);
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toMatchObject({
      cache: { positiveExact: 0, validNegative: 0 },
      learned: { observations: 0 },
      newLookupStatus: { state: 'disabled' },
    });
  });
});
