import { airport } from '../airport';
import { normalizeTraffic } from '../normalize';
import type { TrafficSourceId } from '../traffic-sources';
import type { TrafficSnapshot } from '../types';

export interface TrafficProvider {
  id: TrafficSourceId;
  url: string;
  normalize(raw: unknown, receivedAt: number): TrafficSnapshot;
}

function readsbSnapshot(raw: unknown, now: number, id: TrafficSourceId) {
  if (raw && typeof raw === 'object') {
    const body = raw as Record<string, unknown>;
    if (body.error || (typeof body.msg === 'string' && body.msg !== 'No error'))
      throw new Error('Upstream reported an error');
  }
  return normalizeTraffic(raw, now, id);
}

// Every adapter requests the configured airport area. Device
// viewing points and arbitrary client-supplied URLs never reach these adapters.
export const trafficProviders: Record<TrafficSourceId, TrafficProvider> = {
  'adsb-lol': {
    id: 'adsb-lol',
    url: `https://api.adsb.lol/v2/point/${airport.center.lat}/${airport.center.lon}/${airport.radiusNm}`,
    normalize: (raw, now) => readsbSnapshot(raw, now, 'adsb-lol'),
  },
  'adsb-fi': {
    id: 'adsb-fi',
    // v3 is the documented replacement for the deprecated v2 radius endpoint.
    url: `https://opendata.adsb.fi/api/v3/lat/${airport.center.lat}/lon/${airport.center.lon}/dist/${airport.radiusNm}`,
    normalize: (raw, now) => readsbSnapshot(raw, now, 'adsb-fi'),
  },
};

export function configuredTrafficProviders(value?: string): TrafficProvider[] {
  const ids = (value ?? 'adsb-lol,adsb-fi').split(',').map((id) => id.trim());
  if (!ids.length || ids.some((id) => !Object.hasOwn(trafficProviders, id)))
    throw new Error('Unknown traffic provider configuration');
  return [...new Set(ids)].map((id) => trafficProviders[id as TrafficSourceId]);
}
