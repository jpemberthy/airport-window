// Safe, display-only metadata. Network adapters live separately on the server.
export const TRAFFIC_SOURCES = {
  'adsb-lol': { name: 'ADSB.lol', href: 'https://www.adsb.lol/' },
  'adsb-fi': { name: 'adsb.fi', href: 'https://adsb.fi/' },
} as const;

export type TrafficSourceId = keyof typeof TRAFFIC_SOURCES;

export function trafficSource(id: TrafficSourceId | undefined) {
  return id ? TRAFFIC_SOURCES[id] : undefined;
}
