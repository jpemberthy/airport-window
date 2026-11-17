// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MomentCard } from '../components/moment-card';
import { identifyAirline } from '../lib/airlines';
import { atmosphereProfile } from '../lib/atmosphere';
import { MOMENT_ORDER } from '../lib/flight-story';
import type { FlightRoute } from '../lib/flight-routes';
import { unavailableWeather } from '../lib/normalize';
import type { AircraftTrack } from '../lib/types';

vi.mock('../components/flight-scene', () => ({ FlightScene: () => null }));
afterEach(cleanup);

const now = Date.parse('2026-10-12T12:00:00Z');
const flight: AircraftTrack = {
  id: 'abcdef',
  positionSource: 'adsb-lol',
  callsign: 'JBU152',
  registration: null,
  aircraftType: 'BCS3',
  lat: 42.37,
  lon: -71.01,
  altitudeFt: 2000,
  speedKt: 160,
  heading: 180,
  verticalRateFpm: -500,
  onGround: false,
  observedAt: now,
  airline: identifyAirline('JBU152'),
};
const route: FlightRoute = {
  verification: 'exact',
  aircraftId: flight.id,
  callsign: flight.callsign!,
  source: 'Flightradar24',
  origin: { icao: 'KSRQ', code: 'SRQ', city: 'Sarasota' },
  destination: { icao: 'KBOS', code: 'BOS', city: 'Boston' },
};
const weather = unavailableWeather('', now);
const props = {
  weather,
  atmosphere: atmosphereProfile(weather, 1, now),
  now,
  status: 'Live positions',
  nearLabel: null,
  onCycle: () => {},
  onSelect: () => {},
};

describe('plain activity labels and accurate source attribution', () => {
  it.each(MOMENT_ORDER)(
    'shows %s without an inferred/confirmed qualifier',
    (moment) => {
      const featured = { flight, moment };
      const { container } = render(
        <MomentCard
          {...props}
          featured={featured}
          moments={[featured]}
          route={route}
        />,
      );
      expect(container.querySelector('h2')?.textContent?.toLowerCase()).toBe(
        `${moment}.`,
      );
      expect(container.textContent).not.toMatch(/inferred|confirmed|certain/i);
      expect(container.querySelector('.card-source')?.textContent).toBe(
        'ADSB.lol · Flightradar24',
      );
    },
  );

  it.each([null, { ...route, source: undefined }])(
    'does not claim FR24 data without provider attribution',
    (value) => {
      const featured = { flight, moment: 'approach' as const };
      const { container } = render(
        <MomentCard
          {...props}
          featured={featured}
          moments={[featured]}
          route={value}
        />,
      );
      expect(container.querySelector('.card-source')?.textContent).toBe(
        'ADSB.lol',
      );
      expect(container.textContent).not.toContain('Flightradar24');
      if (!value) {
        expect(container.textContent).not.toMatch(/route unavailable/i);
        expect(container.querySelector('.flight-route')).toBeNull();
      }
    },
  );

  it('shows a route only while it is available, without leaving a placeholder', () => {
    const featured = { flight, moment: 'approach' as const };
    const cardProps = { ...props, featured, moments: [featured] };
    const { container, rerender } = render(
      <MomentCard {...cardProps} route={null} />,
    );
    expect(container.querySelector('.flight-route')).toBeNull();
    expect(container.textContent).toContain('JBU152');
    expect(container.textContent).toContain('BCS3');

    rerender(<MomentCard {...cardProps} route={route} />);
    expect(container.querySelector('.flight-route')?.textContent).toContain(
      'SRQ → BOS',
    );

    rerender(<MomentCard {...cardProps} route={null} />);
    expect(container.querySelector('.flight-route')).toBeNull();
    expect(container.textContent).not.toMatch(/route unavailable|SRQ/);
  });

  it('labels learned evidence as a usual route', () => {
    const featured = { flight, moment: 'approach' as const };
    const { container } = render(
      <MomentCard
        {...props}
        featured={featured}
        moments={[featured]}
        route={{ ...route, verification: 'usual' }}
      />,
    );
    expect(container.querySelector('.flight-route')?.textContent).toContain(
      'Usually from Sarasota · SRQ',
    );
  });

  it('credits the alternative feed on the flight, including its link', () => {
    const featured = {
      flight: { ...flight, positionSource: 'adsb-fi' as const },
      moment: 'approach' as const,
    };
    const { container, getByRole } = render(
      <MomentCard
        {...props}
        featured={featured}
        moments={[featured]}
        route={route}
      />,
    );
    expect(container.querySelector('.card-source')?.textContent).toBe(
      'adsb.fi · Flightradar24',
    );
    expect(getByRole('link', { name: 'adsb.fi' }).getAttribute('href')).toBe(
      'https://adsb.fi/',
    );
    expect(container.textContent).not.toContain('ADSB.lol');
  });

  it('preserves the honest empty state', () => {
    const { container } = render(
      <MomentCard {...props} featured={null} moments={[]} route={null} />,
    );
    expect(container.textContent).toContain('WAITING FOR ACTIVITY');
    expect(container.textContent).toContain('Live ADS-B positions');
  });
});
