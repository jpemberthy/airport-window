'use client';

import { useEffect, useRef, useState } from 'react';
import {
  routeDirection,
  type FlightRoute,
  type RouteStatus,
} from './flight-routes';
import type { AircraftTrack } from './types';

export function routeLookupKey(track: AircraftTrack | null | undefined) {
  return track?.callsign
    ? `${track.id}:${track.callsign.trim().toUpperCase()}:${routeDirection(track)}:${track.onGround === true ? 'ground' : 'air'}`
    : null;
}

export function useFlightRoutes(
  tracks: (AircraftTrack | null | undefined)[],
  now: number,
) {
  const [routes, setRoutes] = useState<Record<string, FlightRoute | null>>({});
  const [enabled, setEnabled] = useState(true);
  const [pulse, setPulse] = useState(0);
  const requested = useRef(new Map<string, number>());
  const key = [
    ...new Set(
      tracks
        .filter((track) => track && now - track.observedAt < 35_000)
        .map(routeLookupKey)
        .filter((s): s is string => Boolean(s)),
    ),
  ]
    .sort((a, b) => a.localeCompare(b))
    .join('|');

  useEffect(() => {
    const wake = () => {
      if (!document.hidden) {
        setPulse((n) => n + 1);
        setRoutes((previous) =>
          Object.fromEntries(
            Object.entries(previous).filter(
              ([, route]) => route && (route.expiresAt ?? 0) > Date.now(),
            ),
          ),
        );
      }
    };
    const timer = setInterval(wake, 30_000);
    document.addEventListener('visibilitychange', wake);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', wake);
    };
  }, []);

  useEffect(() => {
    if (!enabled || document.hidden) return;
    let disposed = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const identity of key.split('|').filter(Boolean)) {
      const [hex, callsign] = identity.split(':');
      if (
        !/^[a-f0-9]{6}$/.test(hex) ||
        !/^[A-Z0-9]{3,8}$/.test(callsign) ||
        (requested.current.get(identity) ?? 0) > Date.now()
      )
        continue;
      requested.current.set(identity, Date.now() + 60_000);
      void fetch(
        `/api/route?callsign=${encodeURIComponent(callsign)}&hex=${encodeURIComponent(hex)}`,
      )
        .then(async (response) => {
          if (!response.ok) throw new Error('Route unavailable');
          return (await response.json()) as {
            route: FlightRoute | null;
            enabled: boolean;
            status?: RouteStatus;
          };
        })
        .then(({ route, enabled: available, status }) => {
          if (disposed) return;
          if (!available) {
            setEnabled(false);
            return;
          }
          requested.current.set(
            identity,
            route?.expiresAt ??
              Date.now() + (status === 'pending' ? 5000 : 90_000),
          );
          setRoutes((previous) => ({ ...previous, [identity]: route }));
          if (status === 'pending')
            timers.push(setTimeout(() => setPulse((n) => n + 1), 5100));
          if (requested.current.size > 250)
            requested.current.delete(requested.current.keys().next().value!);
        })
        .catch(() => {
          // A route is optional; live positions and card rotation continue.
        });
    }
    return () => {
      disposed = true;
      timers.forEach(clearTimeout);
    };
  }, [key, enabled, pulse]);

  return Object.fromEntries(
    Object.entries(routes).filter(
      ([, route]) => route && (route.expiresAt ?? 0) > now,
    ),
  );
}
