'use client';

import { airport } from '@/lib/airport';
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Plane,
} from 'lucide-react';
import { FlightScene } from '@/components/flight-scene';
import type { AtmosphereProfile } from '@/lib/atmosphere';
import { ageMs } from '@/lib/normalize';
import {
  flightName,
  MOMENT_ORDER,
  type FlightMoment,
  type LiveMoment,
} from '@/lib/flight-story';
import { routeCaption, type FlightRoute } from '@/lib/flight-routes';
import type { AircraftTrack, WeatherSnapshot } from '@/lib/types';
import { trafficSource } from '@/lib/traffic-sources';
const formatNumber = (n: number | null, unit: string) =>
  n === null ? '—' : `${Math.round(n).toLocaleString()} ${unit}`;
const formatAge = (timestamp: number | null, now: number) =>
  timestamp === null
    ? 'No report yet'
    : ageMs(timestamp, now) < 60_000
      ? `${Math.floor(ageMs(timestamp, now) / 1000)}s ago`
      : `${Math.floor(ageMs(timestamp, now) / 60_000)}m ago`;

const momentCopy: Record<FlightMoment, { title: string; tag: string }> = {
  approach: {
    title: 'Approach',
    tag: 'INBOUND',
  },
  landing: {
    title: 'Landing',
    tag: 'FINAL / TOUCHDOWN',
  },
  taxi: {
    title: 'Taxi',
    tag: 'ON THE GROUND',
  },
  takeoff: {
    title: 'Takeoff',
    tag: 'LIFTOFF',
  },
  climb: {
    title: 'Climb',
    tag: 'OUTBOUND',
  },
};

export function MomentCard({
  featured,
  moments,
  onCycle,
  onSelect,
  weather,
  atmosphere,
  status,
  now,
  route,
  nearLabel,
  active = true,
  reducedMotionOverride,
}: {
  featured: LiveMoment | null;
  moments: LiveMoment[];
  onCycle: (step: number) => void;
  onSelect: (flight: AircraftTrack) => void;
  weather: WeatherSnapshot;
  atmosphere: AtmosphereProfile;
  status: string;
  now: number;
  route: FlightRoute | null;
  nearLabel: string | null;
  active?: boolean;
  reducedMotionOverride?: boolean;
}) {
  const selected = featured?.flight;
  const positionSource = trafficSource(selected?.positionSource);
  const moment = featured?.moment ?? 'approach';
  const scene = momentCopy[moment];
  const arrival = moment === 'approach' || moment === 'landing';
  const Icon = arrival
    ? ArrowDownLeft
    : moment === 'taxi'
      ? Plane
      : ArrowUpRight;
  const index = selected
    ? moments.findIndex(({ flight }) => flight.id === selected.id)
    : -1;
  const canBrowse =
    moments.length > 1 || (moments.length === 1 && featured && index < 0);
  return (
    <article
      className={`flight-card moment-card ${arrival ? 'arrival' : 'departure'}`}
    >
      <div className="card-artwork">
        <FlightScene
          moment={moment}
          weather={weather}
          atmosphere={atmosphere}
          active={active}
          reducedMotionOverride={reducedMotionOverride}
        />
        <div className="art-grain" aria-hidden="true" />
        <div className="art-topline">
          <span className="scene-number">
            {featured
              ? String(MOMENT_ORDER.indexOf(moment) + 1).padStart(2, '0')
              : '--'}{' '}
            <span>/</span> 05 · {airport.iata}
          </span>
          <span className="scene-tag">
            <Icon size={14} strokeWidth={2} />{' '}
            {featured ? scene.tag : 'WAITING FOR ACTIVITY'}
          </span>
        </div>
      </div>
      <div className="card-content">
        <div className="card-heading">
          <div>
            <h2>
              {featured ? scene.title : 'Live activity'}
              <span>.</span>
            </h2>
          </div>
          <span className="flight-count">
            {String(moments.length || (featured ? 1 : 0)).padStart(2, '0')}{' '}
            <span>
              {featured && !moments.length ? 'IN VIEW' : 'IN ROTATION'}
            </span>
          </span>
        </div>
        <div className="card-flight-area" aria-live="polite">
          {selected ? (
            <div key={`${selected.id}-${moment}`} className="flight-data">
              <div className="flight-identity">
                <div
                  className="airline-mark"
                  style={{ backgroundColor: selected.airline.color }}
                  aria-hidden="true"
                >
                  ✦
                </div>
                <div className="flight-copy">
                  <strong>
                    {route?.flightNumber
                      ? `${selected.airline.name} · ${route.flightNumber}`
                      : flightName(selected)}
                  </strong>
                  {route && (
                    <span className="flight-route">
                      {routeCaption(route, moment)}{' '}
                      {moment !== 'taxi' && (
                        <small>
                          {route.origin.code} → {route.destination.code}
                        </small>
                      )}
                    </span>
                  )}
                  {nearLabel && (
                    <span className="nearby-distance">{nearLabel}</span>
                  )}
                  <span>
                    {selected.aircraftType && (
                      <>
                        {selected.aircraftType} <i>·</i>{' '}
                      </>
                    )}
                    {selected.observedAt === null
                      ? 'Position pending'
                      : `Position updated ${formatAge(selected.observedAt, now)}`}
                  </span>
                </div>
                <button
                  className="round-action"
                  onClick={() => onSelect(selected)}
                  aria-label={`Details for ${flightName(selected)}`}
                >
                  <ArrowUpRight size={18} />
                </button>
              </div>
              <div className="flight-meta">
                <span>
                  CALLSIGN <strong>{selected.callsign ?? '—'}</strong>
                </span>
                <span>
                  ALTITUDE{' '}
                  <strong>
                    {selected.onGround
                      ? 'Ground'
                      : formatNumber(selected.altitudeFt, 'ft')}
                  </strong>
                </span>
                <span>
                  SPEED <strong>{formatNumber(selected.speedKt, 'kt')}</strong>
                </span>
              </div>
            </div>
          ) : (
            <div className="flight-empty">
              <Plane size={21} strokeWidth={1.4} />
              <div>
                <strong>
                  {status === 'Live positions'
                    ? `A quiet moment at ${airport.name}`
                    : 'Waiting for live flights'}
                </strong>
                <span>
                  {status === 'Live positions'
                    ? 'The next reported movement will appear here.'
                    : 'The scene stays open while positions reconnect.'}
                </span>
              </div>
            </div>
          )}
        </div>
        <div className="card-bottom">
          <span className="card-source">
            {positionSource ? (
              <a href={positionSource.href} target="_blank" rel="noreferrer">
                {positionSource.name}
              </a>
            ) : (
              'Live ADS-B positions'
            )}
            {featured &&
              route?.source === 'Flightradar24' &&
              ' · Flightradar24'}
          </span>
          <div className="card-pagination">
            <button
              aria-label="Previous live moment"
              disabled={!canBrowse}
              onClick={() => onCycle(-1)}
            >
              <ArrowLeft size={17} />
            </button>
            <span>
              {moments.length
                ? `${index < 0 ? '--' : String(index + 1).padStart(2, '0')} / ${String(moments.length).padStart(2, '0')}`
                : '00 / 00'}
            </span>
            <button
              aria-label="Next live moment"
              disabled={!canBrowse}
              onClick={() => onCycle(1)}
            >
              <ArrowRight size={17} />
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
