import { airport } from '@/lib/airport';
import type { CSSProperties } from 'react';
import type { AtmosphereProfile } from '@/lib/atmosphere';
import type { FlightMoment } from '@/lib/flight-story';
import type { WeatherSnapshot } from '@/lib/types';
import { WeatherEffects } from './weather-effects';
import { LayeredFlightScene } from './layered-flight-scene';

const art = Object.fromEntries(
  Object.entries(airport.scenes).map(([phase, scene]) => [phase, scene.night]),
) as Record<FlightMoment, string>;
const dayArt = Object.fromEntries(
  Object.entries(airport.scenes).map(([phase, scene]) => [phase, scene.day]),
) as Record<FlightMoment, string>;

export function FlightScene({
  moment,
  weather,
  atmosphere,
  variant = airport.sceneStyle,
  active = true,
  reducedMotionOverride,
}: {
  moment: FlightMoment;
  weather: WeatherSnapshot;
  atmosphere: AtmosphereProfile;
  variant?: 'layered' | 'classic';
  active?: boolean;
  reducedMotionOverride?: boolean;
}) {
  if (variant === 'layered') {
    return (
      <LayeredFlightScene
        moment={moment}
        weather={weather}
        atmosphere={atmosphere}
        active={active}
        reducedMotionOverride={reducedMotionOverride}
      />
    );
  }
  const t = Math.min(1, Math.max(0, (atmosphere.daylight - 0.04) / 0.92));
  const dayMix = t * t * (3 - 2 * t);
  const twilight = 1 - Math.min(1, Math.abs(atmosphere.daylight - 0.45) / 0.45);
  const hazeBand =
    moment === 'taxi'
      ? ['18%', '41%', '54%', '70%']
      : moment === 'takeoff' || moment === 'landing'
        ? ['22%', '44%', '58%', '76%']
        : ['28%', '56%', '72%', '92%'];
  const style = {
    '--sky-top': atmosphere.skyTop,
    '--sky-horizon': atmosphere.skyHorizon,
    '--day-mix': dayMix,
    '--art-brightness':
      1 - atmosphere.cloudCover * 0.06 - atmosphere.haze * 0.07,
    '--art-saturation':
      1 - atmosphere.cloudCover * 0.13 - atmosphere.haze * 0.28,
    '--sky-wash': Math.min(0.2, twilight * 0.12 + atmosphere.cloudCover * 0.04),
    '--overcast': atmosphere.cloudCover * 0.36 + atmosphere.haze * 0.16,
    '--sky-shade': atmosphere.skyShade,
    '--cloud-bottom': `${(0.72 - atmosphere.cloudHeight) * 100}%`,
    '--dryness': (1 - atmosphere.wetness) * (1 - dayMix) * 0.14,
    '--wetness': atmosphere.wetness * 0.32,
    '--rain-reflection': atmosphere.wetness * 0.5,
    '--haze': atmosphere.distanceVeil,
    '--haze-rise': hazeBand[0],
    '--haze-peak': hazeBand[1],
    '--haze-fall': hazeBand[2],
    '--haze-end': hazeBand[3],
    '--snow': atmosphere.precipitation === 'snow' ? 0.26 : 0,
  } as CSSProperties;

  return (
    <figure
      className={`flight-scene scene-${moment === 'taxi' ? 'apron' : 'runway'} scene-${moment}`}
      style={style}
      aria-label={`Illustrated ${moment} at ${airport.name}. ${atmosphere.known ? `Last reported weather: ${weather.description.toLowerCase()}.` : 'Weather effects neutral because a recent report is unavailable.'}`}
    >
      {dayMix < 1 && (
        /* oxlint-disable-next-line next/no-img-element -- The night image is only loaded outside full daylight. */
        <img
          key={`${moment}-night`}
          className="scene-original scene-original-night"
          src={art[moment]}
          alt=""
          width="1672"
          height="941"
          loading="eager"
          decoding="async"
          fetchPriority={dayMix < 0.5 ? 'high' : 'auto'}
        />
      )}
      {dayMix > 0 && (
        /* oxlint-disable-next-line next/no-img-element -- Daylight companion keeps the original pixel art language. */
        <img
          key={`${moment}-day`}
          className="scene-original scene-original-day"
          src={dayArt[moment]}
          alt=""
          width="1672"
          height="941"
          loading="eager"
          decoding="async"
          fetchPriority={dayMix >= 0.5 ? 'high' : 'auto'}
        />
      )}
      <div className="scene-sky-wash" aria-hidden="true" />
      <div className="scene-overcast" aria-hidden="true" />
      <div className="scene-storm-shade" aria-hidden="true" />
      <div className="scene-dry-layer" aria-hidden="true" />
      {dayMix > 0.75 && atmosphere.wetness > 0.1 && (
        /* oxlint-disable-next-line next/no-img-element -- Reuses the night palette for localized rain reflections. */
        <img
          className="scene-rain-reflection"
          src={art[moment]}
          alt=""
          width="1672"
          height="941"
          loading="eager"
          decoding="async"
        />
      )}
      <div className="scene-wet-layer" aria-hidden="true" />
      <div className="scene-snow-layer" aria-hidden="true" />
      <div className="scene-haze" aria-hidden="true" />
      <WeatherEffects
        profile={atmosphere}
        active={active}
        reducedMotionOverride={reducedMotionOverride}
      />
    </figure>
  );
}
