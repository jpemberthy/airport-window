import { AIRPORT, type Coordinate } from './geo';
import type { View } from './renderer';
export const DEFAULT_VIEW: View = {
  zoom: 1,
  center: [AIRPORT.lon, AIRPORT.lat],
};
export function readPreferences(raw: string | null): {
  view: View;
  volume: number;
  muted: boolean;
} {
  const defaults = { view: DEFAULT_VIEW, volume: 0.45, muted: false };
  try {
    const p = JSON.parse(raw ?? 'null');
    if (!p || typeof p !== 'object') return defaults;
    const center = p.view?.center,
      zoom = p.view?.zoom;
    return {
      view: {
        zoom:
          typeof zoom === 'number' && Number.isFinite(zoom)
            ? Math.max(0.12, Math.min(2.5, zoom))
            : 1,
        center:
          Array.isArray(center) &&
          center.length === 2 &&
          center.every(
            (v: unknown) => typeof v === 'number' && Number.isFinite(v),
          ) &&
          Math.abs(center[0] - AIRPORT.lon) < 0.55 &&
          Math.abs(center[1] - AIRPORT.lat) < 0.45
            ? (center as Coordinate)
            : DEFAULT_VIEW.center,
      },
      volume:
        typeof p.volume === 'number' && Number.isFinite(p.volume)
          ? Math.max(0, Math.min(1, p.volume))
          : 0.45,
      muted: typeof p.muted === 'boolean' ? p.muted : false,
    };
  } catch {
    return defaults;
  }
}
