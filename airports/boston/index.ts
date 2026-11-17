import { defineAirport } from '../types';
import { bostonMap } from './map';
export const boston = defineAirport({
  id: 'boston',
  icao: 'KBOS',
  iata: 'BOS',
  name: 'Boston Logan',
  city: 'Boston',
  country: 'United States',
  center: { lat: 42.364, lon: -71.009 },
  elevationFt: 20,
  radiusNm: 20,
  weatherStation: 'KBOS',
  timeZone: 'America/New_York',
  brand: {
    title: 'LoganWatch',
    wordmark: 'LOGAN',
    description: 'A neon arcade window onto Boston Logan.',
    about:
      'A little window onto Boston Logan, inspired by living next to the airport.',
  },
  sceneBearing: 270,
  sceneStyle: 'layered',
  scenes: {
    approach: {
      day: '/art/arrival-day.webp',
      night: '/art/arrival-arcade.webp',
      foregroundDay: '/art/approach-foreground-day.webp',
      foregroundNight: '/art/approach-foreground-night.webp',
      aircraftMask: '/art/approach-aircraft-mask.webp',
    },
    landing: {
      day: '/art/landing-day.webp',
      night: '/art/landing-arcade.webp',
      foregroundDay: '/art/landing-foreground-day.webp',
      foregroundNight: '/art/landing-foreground-night.webp',
      aircraftMask: '/art/landing-aircraft-mask.webp',
    },
    taxi: {
      day: '/art/taxi-day.webp',
      night: '/art/taxi-arcade.webp',
      foregroundDay: '/art/taxi-foreground-day.webp',
      foregroundNight: '/art/taxi-foreground-night.webp',
      aircraftMask: '/art/taxi-aircraft-mask.svg',
    },
    takeoff: {
      day: '/art/takeoff-day.webp',
      night: '/art/takeoff-arcade.webp',
      foregroundDay: '/art/takeoff-foreground-day.webp',
      foregroundNight: '/art/takeoff-foreground-night.webp',
      aircraftMask: '/art/takeoff-aircraft-mask.webp',
    },
    climb: {
      day: '/art/climb-day.webp',
      night: '/art/departure-arcade.webp',
      foregroundDay: '/art/climb-foreground-day.webp',
      foregroundNight: '/art/climb-foreground-night.webp',
      aircraftMask: '/art/climb-aircraft-mask.webp',
    },
  },
  sharedArt: {
    sun: '/art/approach-sun.webp',
    moon: '/art/approach-moon.webp',
    clouds: '/art/approach-clouds.webp',
  },
  tower: {
    streamUrl: 'https://d.liveatc.net/kbos1_twr',
    playerUrl: 'https://www.liveatc.net/hlisten.php?mount=kbos1_twr&icao=kbos',
    label: 'LiveATC · Boston Logan',
  },
  map: bostonMap,
});
