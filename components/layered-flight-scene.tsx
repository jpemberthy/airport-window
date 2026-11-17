import { airport } from '@/lib/airport';
import type { CSSProperties } from 'react';
import type { AtmosphereProfile } from '@/lib/atmosphere';
import { layeredArt } from '@/lib/layered-art';
import type { FlightMoment } from '@/lib/flight-story';
import type { WeatherSnapshot } from '@/lib/types';
import { WeatherEffects } from './weather-effects';

const foregroundArt = Object.fromEntries(
  Object.entries(airport.scenes).map(([phase, scene]) => [
    phase,
    {
      day: scene.foregroundDay ?? scene.day,
      night: scene.foregroundNight ?? scene.night,
      fallbackDay: scene.day,
      fallbackNight: scene.night,
    },
  ]),
) as Record<
  FlightMoment,
  { day: string; night: string; fallbackDay: string; fallbackNight: string }
>;
const aircraftMaskArt = Object.fromEntries(
  Object.entries(airport.scenes).map(([phase, scene]) => [
    phase,
    scene.aircraftMask,
  ]),
) as Record<FlightMoment, string>;

export function LayeredFlightScene({
  moment,
  weather,
  atmosphere,
  active = true,
  reducedMotionOverride,
}: {
  moment: FlightMoment;
  weather: WeatherSnapshot;
  atmosphere: AtmosphereProfile;
  active?: boolean;
  reducedMotionOverride?: boolean;
}) {
  const t = Math.min(1, Math.max(0, (atmosphere.daylight - 0.04) / 0.92));
  const dayMix = t * t * (3 - 2 * t);
  const art = layeredArt(atmosphere, weather.ceilingFt);
  const sceneArt = foregroundArt[moment];
  const orbArt =
    dayMix >= 0.5 ? airport.sharedArt?.sun : airport.sharedArt?.moon;
  const style = {
    '--aircraft-mask': `url('${aircraftMaskArt[moment]}')`,
    '--sun-art': `url('${airport.sharedArt?.sun}')`,
    '--moon-art': `url('${airport.sharedArt?.moon}')`,
    '--approach-sky-top': art.skyTop,
    '--approach-sky-horizon': art.skyHorizon,
    '--approach-cloud-opacity': art.cloudOpacity,
    '--approach-cloud-brightness':
      0.48 + dayMix * 0.42 - atmosphere.cloudCover * 0.14,
    '--approach-cloud-top': `${art.cloudTop}%`,
    '--approach-orb-opacity': art.orbOpacity,
    '--approach-distance-veil': art.distanceVeil,
    '--approach-haze-color': art.hazeColor,
    '--approach-drift': `${art.drift}px`,
    '--day-mix': dayMix,
    '--art-brightness': 1 - atmosphere.cloudCover * 0.09,
    '--art-saturation':
      1 - atmosphere.cloudCover * 0.12 - atmosphere.haze * 0.16,
    '--wetness': atmosphere.wetness * 0.32,
    '--rain-reflection': atmosphere.wetness * 0.5,
    '--snow': atmosphere.precipitation === 'snow' ? 0.26 : 0,
  } as CSSProperties;

  // The same URL is used in both foreground layers, so the browser transfers it once.
  const foreground = (
    <>
      {dayMix < 1 && (
        /* oxlint-disable-next-line next/no-img-element -- Transparent art is authored and compressed for these fixed scenes. */
        <img
          className="scene-original scene-original-night"
          src={sceneArt.night}
          alt=""
          width="1672"
          height="941"
          decoding="async"
          fetchPriority={dayMix < 0.5 ? 'high' : 'auto'}
          onError={(event) => {
            event.currentTarget.src = sceneArt.fallbackNight;
          }}
        />
      )}
      {dayMix > 0 && (
        /* oxlint-disable-next-line next/no-img-element -- Day/night assets share one fixed composition. */
        <img
          className="scene-original scene-original-day"
          src={sceneArt.day}
          alt=""
          width="1672"
          height="941"
          decoding="async"
          fetchPriority={dayMix >= 0.5 ? 'high' : 'auto'}
          onError={(event) => {
            event.currentTarget.src = sceneArt.fallbackDay;
          }}
        />
      )}
    </>
  );

  return (
    <figure
      className={`flight-scene scene-${moment === 'taxi' ? 'apron' : 'runway'} scene-${moment} scene-layered ${active ? '' : 'scene-suspended'}`}
      style={style}
      aria-label={`Illustrated ${moment} at ${airport.name}. ${atmosphere.known ? `Last reported weather: ${weather.description.toLowerCase()}.` : 'Weather effects neutral because a recent report is unavailable.'}`}
    >
      <link rel="preload" as="image" href={aircraftMaskArt[moment]} />
      {art.cloudOpacity > 0 && (
        <link rel="preload" as="image" href={airport.sharedArt?.clouds} />
      )}
      {art.orbOpacity > 0 && <link rel="preload" as="image" href={orbArt} />}
      <div className="approach-sky" aria-hidden="true" />
      {art.orbOpacity > 0 && (
        <div
          className={`approach-orb ${dayMix >= 0.5 ? 'approach-sun' : 'approach-moon'}`}
          aria-hidden="true"
        />
      )}
      {art.cloudOpacity > 0 && (
        <div className="approach-cloud-field" aria-hidden="true">
          {/* oxlint-disable-next-line next/no-img-element -- One optimized cloud sprite supports cloud-cover changes. */}
          <img
            src={airport.sharedArt?.clouds}
            alt=""
            width="960"
            height="320"
            decoding="async"
          />
        </div>
      )}
      <div className="approach-landscape" aria-hidden="true">
        {foreground}
      </div>
      <div className="approach-distance-veil" aria-hidden="true" />
      <div className="approach-aircraft" aria-hidden="true">
        {foreground}
      </div>
      {dayMix > 0.75 && atmosphere.wetness > 0.1 && (
        /* oxlint-disable-next-line next/no-img-element -- The night foreground supplies existing rain reflections. */
        <img
          className="scene-rain-reflection"
          src={sceneArt.night}
          alt=""
          width="1672"
          height="941"
          decoding="async"
        />
      )}
      <div className="scene-wet-layer" aria-hidden="true" />
      <div className="scene-snow-layer" aria-hidden="true" />
      <WeatherEffects
        profile={atmosphere}
        active={active}
        reducedMotionOverride={reducedMotionOverride}
      />
    </figure>
  );
}
