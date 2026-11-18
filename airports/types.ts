export type ScenePhase = 'approach' | 'landing' | 'taxi' | 'takeoff' | 'climb';
export type Point = [number, number];
export interface SceneArt {
  day: string;
  night: string;
  foregroundDay?: string;
  foregroundNight?: string;
  aircraftMask?: string;
}
export interface AirportMap {
  label?: string;
  shortLabel?: string;
  width: number;
  height: number;
  origin: { lat: number; lon: number };
  projection: {
    a: number;
    b: number;
    c: number;
    d: number;
    scale: number;
    width: number;
    height: number;
  };
  stationaryAnchors: Point[];
  runways: {
    name: string;
    start: Point;
    end: Point;
    artStart: Point;
    artEnd: Point;
  }[];
  taxiLanes: { id: string; points: Point[] }[];
  assets: { day: string; night: string; aircraft: string };
}
export interface AirportPack {
  id: string;
  icao: string;
  iata: string;
  name: string;
  city: string;
  country: string;
  center: { lat: number; lon: number };
  elevationFt: number;
  radiusNm: number;
  weatherStation: string;
  timeZone: string;
  brand: {
    title: string;
    wordmark: string;
    description: string;
    about: string;
  };
  sceneBearing: number;
  scenes: Record<ScenePhase, SceneArt>;
  sceneStyle: 'classic' | 'layered';
  sharedArt?: { sun: string; moon: string; clouds: string };
  tower?: { streamUrl: string; playerUrl: string; label: string };
  map?: AirportMap;
}
export function defineAirport(pack: AirportPack): AirportPack {
  if (
    !/^[a-z0-9-]+$/.test(pack.id) ||
    !/^[A-Z0-9]{4}$/.test(pack.icao) ||
    !/^[A-Z0-9]{3}$/.test(pack.iata) ||
    !/^[A-Z0-9]{4}$/.test(pack.weatherStation)
  )
    throw new Error(
      'Airport pack needs a stable lowercase id and valid ICAO/IATA/weather identifiers',
    );
  if (
    !Number.isFinite(pack.center.lat) ||
    Math.abs(pack.center.lat) >= 89 ||
    !Number.isFinite(pack.center.lon) ||
    Math.abs(pack.center.lon) > 180 ||
    !Number.isFinite(pack.elevationFt) ||
    !(pack.radiusNm > 0 && pack.radiusNm <= 250)
  )
    throw new Error(
      'Airport pack has invalid coordinates, elevation or traffic radius',
    );
  new Intl.DateTimeFormat('en', { timeZone: pack.timeZone });
  if (!Number.isFinite(pack.sceneBearing))
    throw new Error('Scene bearing must be finite');
  for (const phase of [
    'approach',
    'landing',
    'taxi',
    'takeoff',
    'climb',
  ] as const) {
    const art = pack.scenes[phase];
    if (!art?.day?.startsWith('/') || !art?.night?.startsWith('/'))
      throw new Error(`Missing local day/night art for ${phase}`);
    if (
      pack.sceneStyle === 'layered' &&
      (!art.foregroundDay ||
        !art.foregroundNight ||
        !art.aircraftMask ||
        !pack.sharedArt)
    )
      throw new Error(`Layered art is incomplete for ${phase}`);
  }
  if (pack.tower)
    for (const value of [pack.tower.streamUrl, pack.tower.playerUrl]) {
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.username || url.password)
        throw new Error(
          'Tower URLs must be public HTTPS URLs without credentials',
        );
    }
  return pack;
}
