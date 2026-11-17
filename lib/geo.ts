import { airportCenter } from './airport';
export type Coordinate = [number, number];
export const AIRPORT = airportCenter;
const LAT_METERS = 111_320;
export function localMeters(lon: number, lat: number): Coordinate {
  return [
    (lon - AIRPORT.lon) * LAT_METERS * Math.cos((AIRPORT.lat * Math.PI) / 180),
    (lat - AIRPORT.lat) * LAT_METERS,
  ];
}
export function projectedMeters(lon: number, lat: number): Coordinate {
  const [e, n] = localMeters(lon, lat);
  return [0.92 * e + 0.32 * n, 0.16 * e - 0.66 * n];
}
export function project(
  lon: number,
  lat: number,
  width: number,
  height: number,
  zoom = 1,
  center: Coordinate = [AIRPORT.lon, AIRPORT.lat],
): Coordinate {
  const [x, y] = projectedMeters(lon, lat);
  const [cx, cy] = projectedMeters(...center);
  const scale = Math.min(width / 5500, height / 3400) * zoom;
  return [width * 0.53 + (x - cx) * scale, height * 0.51 + (y - cy) * scale];
}
export function unproject(
  x: number,
  y: number,
  width: number,
  height: number,
  zoom = 1,
  center: Coordinate = [AIRPORT.lon, AIRPORT.lat],
): Coordinate {
  const scale = Math.min(width / 5500, height / 3400) * zoom;
  const [cx, cy] = projectedMeters(...center);
  const px = (x - width * 0.53) / scale + cx,
    py = (y - height * 0.51) / scale + cy;
  const determinant = 0.92 * -0.66 - 0.32 * 0.16;
  const east = (-0.66 * px - 0.32 * py) / determinant,
    north = (-0.16 * px + 0.92 * py) / determinant;
  return [
    AIRPORT.lon + east / (LAT_METERS * Math.cos((AIRPORT.lat * Math.PI) / 180)),
    AIRPORT.lat + north / LAT_METERS,
  ];
}
