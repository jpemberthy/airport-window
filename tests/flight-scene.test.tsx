import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { FlightScene } from '../components/flight-scene';
import { atmosphereProfile } from '../lib/atmosphere';
import type { FlightMoment } from '../lib/flight-story';
import { unavailableWeather } from '../lib/normalize';

const now = Date.parse('2026-09-27T18:00:00Z');
const clear = {
  ...unavailableWeather('', 0),
  observedAt: now,
  description: 'Clear skies',
};

describe('flight scene artwork', () => {
  it('loads the transparent approach foreground without painted clouds in clear daylight', () => {
    const html = renderToStaticMarkup(
      <FlightScene
        moment="approach"
        weather={clear}
        atmosphere={atmosphereProfile(clear, 1, now)}
      />,
    );
    expect(html).toContain('src="/art/approach-foreground-day.webp"');
    expect(html).not.toContain('src="/art/arrival-day.webp"');
    expect(html).not.toContain('src="/art/approach-clouds.webp"');
    expect(html).toContain('class="approach-orb approach-sun"');
    expect(html).toContain('class="approach-aircraft"');
  });

  it('keeps the original approach scene available for lab comparison', () => {
    const html = renderToStaticMarkup(
      <FlightScene
        moment="approach"
        variant="classic"
        weather={clear}
        atmosphere={atmosphereProfile(clear, 1, now)}
      />,
    );
    expect(html).toContain('src="/art/arrival-day.webp"');
    expect(html).not.toContain('approach-cloud-field');
  });

  it.each(['landing', 'taxi', 'takeoff', 'climb'] as FlightMoment[])(
    'loads %s foregrounds at dusk and retains the classic comparison',
    (moment) => {
      const dusk = renderToStaticMarkup(
        <FlightScene
          moment={moment}
          weather={clear}
          atmosphere={atmosphereProfile(clear, 0.5, now)}
        />,
      );
      const classic = renderToStaticMarkup(
        <FlightScene
          moment={moment}
          variant="classic"
          weather={clear}
          atmosphere={atmosphereProfile(clear, 0.5, now)}
        />,
      );
      expect(dusk).toContain(`src="/art/${moment}-foreground-day.webp"`);
      expect(dusk).toContain(`src="/art/${moment}-foreground-night.webp"`);
      expect(dusk).toContain('approach-distance-veil');
      expect(classic).not.toContain('foreground');
      expect(classic).not.toContain('approach-distance-veil');
    },
  );

  it('uses the night image only as a lower reflection in daytime rain', () => {
    const rainy = {
      ...clear,
      precipitation: 'rain' as const,
      precipitationIntensity: 'heavy' as const,
    };
    const html = renderToStaticMarkup(
      <FlightScene
        moment="taxi"
        weather={rainy}
        atmosphere={atmosphereProfile(rainy, 1, now)}
      />,
    );
    expect(html).toContain('class="scene-rain-reflection"');
    expect(html).toContain('src="/art/taxi-foreground-day.webp"');
    expect(html).toContain('src="/art/taxi-foreground-night.webp"');
  });
});
