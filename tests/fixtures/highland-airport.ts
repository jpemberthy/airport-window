import { defineAirport } from '../../airports/types';
import { aep } from '../../airports/aep';
// Fictional high-altitude airport: no live network calls ever use this pack.
export const highland = defineAirport({
  ...aep,
  map: undefined,
  id: 'test-highland',
  icao: 'TEST',
  iata: 'TST',
  name: 'Synthetic Highland',
  city: 'Test City',
  country: 'Test Country',
  center: { lat: 35.5, lon: 139.5 },
  elevationFt: 8500,
  radiusNm: 35,
  weatherStation: 'TEST',
  timeZone: 'Asia/Tokyo',
  sceneBearing: 90,
  brand: {
    title: 'Highland Test',
    wordmark: 'HIGHLAND',
    description: 'Synthetic test only',
    about: 'Synthetic test only',
  },
});
