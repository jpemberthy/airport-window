import { airport } from './airport';
import { getPosition, getTimes } from 'suncalc';
import { AIRPORT } from './geo';
export function daylight(now = Date.now()) {
  const date = new Date(now),
    position = getPosition(date, AIRPORT.lat, AIRPORT.lon),
    times = getTimes(date, AIRPORT.lat, AIRPORT.lon);
  const daylight = Math.max(0, Math.min(1, (position.altitude + 6) / 16));
  return {
    daylight,
    altitude: position.altitude,
    phase:
      position.altitude > 6
        ? 'Daylight'
        : position.altitude > -0.833
          ? 'Golden hour'
          : position.altitude > -6
            ? 'Blue hour'
            : 'After dark',
    sunrise: times.sunrise?.getTime() ?? null,
    sunset: times.sunset?.getTime() ?? null,
  };
}
export function airportTime(now: number, seconds = false) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: airport.timeZone,
    hour: '2-digit',
    minute: '2-digit',
    ...(seconds ? { second: '2-digit' } : {}),
    hour12: false,
  }).format(now);
}
export function airportZone(now: number) {
  return (
    new Intl.DateTimeFormat('en-US', {
      timeZone: airport.timeZone,
      timeZoneName: 'short',
    })
      .formatToParts(now)
      .find((p) => p.type === 'timeZoneName')?.value ?? airport.city
  );
}
