import { defineAirport } from '../types';
import { aep } from '../aep';
// Copy this directory, replace every airport field, and supply your own art.
// These AEP images are temporary working references, not pictures of your airport.
export const myAirport = defineAirport({
  id: 'my-airport',
  icao: 'XXXX',
  iata: 'XXX',
  name: 'My airport',
  city: 'My city',
  country: 'My country',
  center: { lat: 0, lon: 0 },
  elevationFt: 0,
  radiusNm: 20,
  weatherStation: 'XXXX',
  timeZone: 'Etc/UTC',
  sceneBearing: 0,
  sceneStyle: 'classic',
  brand: {
    title: 'My Airport Watch',
    wordmark: 'MY AIRPORT',
    description: 'A window onto my local airport.',
    about: 'An independent Airport Window installation.',
  },
  scenes: aep.scenes,
  // Omit tower and map until you have usable assets and a permitted stream.
});
