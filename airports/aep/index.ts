import { defineAirport } from '../types';
import { aepMap } from './map';
export const aep = defineAirport({
  id: 'aep',
  icao: 'SABE',
  iata: 'AEP',
  name: 'Aeroparque Jorge Newbery',
  city: 'Buenos Aires',
  country: 'Argentina',
  center: { lat: -34.5594, lon: -58.4155 },
  elevationFt: 18,
  radiusNm: 20,
  weatherStation: 'SABE',
  timeZone: 'America/Argentina/Buenos_Aires',
  brand: {
    title: 'Aeroparque Watch',
    wordmark: 'AEROPARQUE',
    description: 'A little window onto Aeroparque and the Río de la Plata.',
    about:
      'A live illustrated window onto Aeroparque Jorge Newbery in Buenos Aires. Made from Airport Window, the self-hosted edition of LoganWatch.',
  },
  sceneBearing: 225,
  sceneStyle: 'classic',
  map: aepMap,
  scenes: {
    approach: {
      day: '/airports/aep/approach-day.webp',
      night: '/airports/aep/approach-night.webp',
    },
    landing: {
      day: '/airports/aep/landing-day.webp',
      night: '/airports/aep/landing-night.webp',
    },
    taxi: {
      day: '/airports/aep/taxi-day.webp',
      night: '/airports/aep/taxi-night.webp',
    },
    takeoff: {
      day: '/airports/aep/takeoff-day.webp',
      night: '/airports/aep/takeoff-night.webp',
    },
    climb: {
      day: '/airports/aep/climb-day.webp',
      night: '/airports/aep/climb-night.webp',
    },
  },
});
