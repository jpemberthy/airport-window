import selectedAirport from '../airport.config';
export const airport = selectedAirport;
export const airportCenter = { ...airport.center, radiusNm: airport.radiusNm };
export const hasAirportMap = Boolean(airport.map);
export const observerRadiusMiles = airport.radiusNm * 1.15078;
export const heightAboveAirport = (altitudeFt: number | null) =>
  altitudeFt === null ? null : Math.max(0, altitudeFt - airport.elevationFt);
export const airportCacheKey = `${airport.id}:${airport.icao}:${airport.center.lat}:${airport.center.lon}:${airport.radiusNm}`;
