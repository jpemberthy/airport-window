import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { FlightScene } from '../components/flight-scene';
import { layeredArt } from '../lib/layered-art';
import { atmosphereProfile } from '../lib/atmosphere';
import { unavailableWeather } from '../lib/normalize';

const now = Date.parse('2026-09-27T18:00:00Z');
const clear = {
  ...unavailableWeather('', 0),
  observedAt: now,
  cloudCover: 0,
  visibilityMiles: 10,
  description: 'Clear skies',
};

describe('layered scenes', () => {
  it('darkens the sky and lowers clouds using reported cover and ceiling', () => {
    const open = layeredArt(atmosphereProfile(clear, 1, now), null);
    const overcast = layeredArt(
      atmosphereProfile({ ...clear, cloudCover: 1, ceilingFt: 700 }, 1, now),
      700,
    );
    expect(open.cloudOpacity).toBe(0);
    expect(overcast.cloudOpacity).toBe(1);
    expect(overcast.cloudTop).toBeGreaterThan(open.cloudTop);
    expect(overcast.orbOpacity).toBe(0);
    expect(overcast.skyTop).not.toBe(open.skyTop);
  });

  it('veils the distance while leaving the aircraft layer above it', () => {
    const mist = {
      ...clear,
      cloudCover: 1,
      ceilingFt: 700,
      visibilityMiles: 2.5,
      mist: true,
    };
    const art = layeredArt(atmosphereProfile(mist, 1, now), 700);
    const html = renderToStaticMarkup(
      <FlightScene
        moment="approach"
        weather={mist}
        atmosphere={atmosphereProfile(mist, 1, now)}
      />,
    );
    expect(art.distanceVeil).toBeGreaterThan(0.8);
    expect(html.indexOf('approach-distance-veil')).toBeLessThan(
      html.indexOf('class="approach-aircraft"'),
    );
    expect(html).toContain('src="/art/approach-clouds.webp"');
    expect(html).not.toContain('class="approach-orb');
  });

  it('uses a neutral cloudless sky for stale weather and a moon on a clear night', () => {
    const stale = { ...clear, observedAt: now - 91 * 60_000 };
    const staleArt = layeredArt(atmosphereProfile(stale, 1, now), null);
    const staleHtml = renderToStaticMarkup(
      <FlightScene
        moment="approach"
        weather={stale}
        atmosphere={atmosphereProfile(stale, 1, now)}
      />,
    );
    const nightHtml = renderToStaticMarkup(
      <FlightScene
        moment="approach"
        weather={clear}
        atmosphere={atmosphereProfile(clear, 0, now)}
      />,
    );
    expect(staleArt.cloudOpacity).toBe(0);
    expect(staleArt.orbOpacity).toBe(0);
    expect(staleHtml).not.toContain('class="approach-orb');
    expect(nightHtml).toContain('class="approach-orb approach-moon"');
    expect(nightHtml).toContain('src="/art/approach-foreground-night.webp"');
  });
});
