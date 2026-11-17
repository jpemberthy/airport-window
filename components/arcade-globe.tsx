'use client';

import { airport as homeAirport } from '@/lib/airport';

import { useEffect, useRef } from 'react';
import {
  geoDistance,
  geoGraticule10,
  geoInterpolate,
  geoOrthographic,
  geoPath,
  type GeoPermissibleObjects,
} from 'd3-geo';
import land from '@/lib/globe-land.json';
import type { FlightRoute, RouteAirport } from '@/lib/flight-routes';

const HOME: [number, number] = [homeAirport.center.lon, homeAirport.center.lat];
export function remoteAirport(route: FlightRoute | null): RouteAirport | null {
  return route
    ? route.origin.icao === homeAirport.icao
      ? route.destination
      : route.origin
    : null;
}
export default function ArcadeGlobe({
  route,
  active = true,
}: {
  route: FlightRoute | null;
  active?: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const orientation = useRef<[number, number]>(HOME);
  const airport = remoteAirport(route);
  const lat = airport?.lat,
    lon = airport?.lon;
  const hasCoordinates =
    typeof lat === 'number' &&
    Number.isFinite(lat) &&
    Math.abs(lat) <= 90 &&
    typeof lon === 'number' &&
    Number.isFinite(lon) &&
    Math.abs(lon) <= 180;
  const caption = airport
    ? `${route?.origin.icao === homeAirport.icao ? 'To' : 'From'} ${airport.city}${airport.country ? `, ${airport.country}` : ''}`
    : `${homeAirport.city}, ${homeAirport.country}`;

  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext('2d');
    if (!element || !context) return;
    const remote: [number, number] | null = hasCoordinates
      ? [lon!, lat!]
      : null;
    const target = remote
      ? (geoInterpolate(HOME, remote)(0.5) as [number, number])
      : HOME;
    const from = orientation.current;
    const interpolate = geoInterpolate(from, target);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0,
      start = 0,
      visible = true,
      settled = false;
    function paint(center: [number, number]) {
      const ctx = context!;
      const projection = geoOrthographic()
        .translate([90, 90])
        .scale(78)
        .rotate([-center[0], -center[1]])
        .clipAngle(90);
      const path = geoPath(projection, ctx);
      ctx.clearRect(0, 0, 180, 180);
      ctx.beginPath();
      path({ type: 'Sphere' });
      ctx.fillStyle = '#102936';
      ctx.fill();
      ctx.strokeStyle = '#52747d';
      ctx.lineWidth = 0.65;
      ctx.stroke();
      ctx.beginPath();
      path(geoGraticule10());
      ctx.strokeStyle = '#224550';
      ctx.lineWidth = 0.4;
      ctx.stroke();
      ctx.beginPath();
      path(land as GeoPermissibleObjects);
      ctx.fillStyle = '#628174';
      ctx.fill();
      ctx.strokeStyle = '#86a083';
      ctx.lineWidth = 0.3;
      ctx.stroke();
      if (remote) {
        ctx.beginPath();
        path({ type: 'LineString', coordinates: [HOME, remote] });
        ctx.strokeStyle = '#ffe3a0';
        ctx.lineWidth = 1.15;
        ctx.stroke();
      }
      for (const [point, label] of [
        [HOME, homeAirport.iata],
        ...(remote ? [[remote, airport?.code ?? '']] : []),
      ] as [[number, number], string][]) {
        if (geoDistance(center, point) > Math.PI / 2) continue;
        const p = projection(point);
        if (!p) continue;
        ctx.fillStyle = '#ffce8c';
        ctx.fillRect(Math.round(p[0]) - 2, Math.round(p[1]) - 2, 4, 4);
        ctx.font = '7px monospace';
        ctx.textAlign = p[0] > 125 ? 'right' : 'left';
        ctx.fillStyle = '#f8edce';
        ctx.fillText(label, p[0] + (p[0] > 125 ? -5 : 5), p[1] - 4);
      }
    }
    function animate(time: number) {
      if (document.hidden || !visible) return;
      start ||= time;
      const progress = reduce.matches ? 1 : Math.min(1, (time - start) / 1100);
      const eased = 1 - Math.pow(1 - progress, 3);
      orientation.current = interpolate(eased) as [number, number];
      paint(orientation.current);
      settled = progress === 1;
      if (!settled) frame = requestAnimationFrame(animate);
    }
    function resume() {
      cancelAnimationFrame(frame);
      if (active && !document.hidden && visible) {
        if (settled) paint(orientation.current);
        else frame = requestAnimationFrame(animate);
      }
    }
    const observer = new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting;
      resume();
    });
    observer.observe(element);
    document.addEventListener('visibilitychange', resume);
    reduce.addEventListener('change', resume);
    resume();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener('visibilitychange', resume);
      reduce.removeEventListener('change', resume);
    };
  }, [lat, lon, hasCoordinates, airport?.code, active]);

  return (
    <figure
      className="arcade-globe"
      aria-label={
        route
          ? `${route.origin.city} to ${route.destination.city}`
          : `Globe centered on ${homeAirport.city}`
      }
    >
      <span className="globe-kicker">
        {homeAirport.city.toUpperCase()} & THE WORLD
      </span>
      <canvas ref={canvas} width={180} height={180} aria-hidden="true" />
      <figcaption>
        {caption}
        {route && (
          <small>
            {route.origin.code} → {route.destination.code}
          </small>
        )}
      </figcaption>
    </figure>
  );
}
