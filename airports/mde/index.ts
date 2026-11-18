import { defineAirport } from '../types';

// José María Córdova serves Medellín from Rionegro, not the city's EOH airport.
// Metadata sources and artwork provenance: ./README.md.
export const mde = defineAirport({
  id: 'mde',
  icao: 'SKRG',
  iata: 'MDE',
  name: 'José María Córdova',
  city: 'Medellín',
  country: 'Colombia',
  center: { lat: 6.164461, lon: -75.423 },
  elevationFt: 7024,
  radiusNm: 20,
  weatherStation: 'SKRG',
  timeZone: 'America/Bogota',
  sceneBearing: 270,
  sceneStyle: 'classic',
  brand: {
    title: 'Medellín Watch',
    wordmark: 'MEDELLÍN',
    description:
      'A little window onto José María Córdova and the green hills of Rionegro.',
    about:
      'A live illustrated window onto José María Córdova, the airport in Rionegro serving Medellín. Made from Airport Window, the self-hosted edition of LoganWatch.',
  },
  scenes: {
    approach: {
      day: '/airports/mde/approach-day.webp',
      night: '/airports/mde/approach-night.webp',
    },
    landing: {
      day: '/airports/mde/landing-day.webp',
      night: '/airports/mde/landing-night.webp',
    },
    taxi: {
      day: '/airports/mde/taxi-day.webp',
      night: '/airports/mde/taxi-night.webp',
    },
    takeoff: {
      day: '/airports/mde/takeoff-day.webp',
      night: '/airports/mde/takeoff-night.webp',
    },
    climb: {
      day: '/airports/mde/climb-day.webp',
      night: '/airports/mde/climb-night.webp',
    },
  },
});
