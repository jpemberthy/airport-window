import type { AtmosphereProfile } from './atmosphere';

const clamp = (value: number, min = 0, max = 1) =>
  Math.min(max, Math.max(min, value));

function mixColor(a: string, b: string, amount: number) {
  const channels = (color: string) =>
    color.startsWith('#')
      ? [1, 3, 5].map((offset) => parseInt(color.slice(offset, offset + 2), 16))
      : [...color.matchAll(/\d+/g)].map(([value]) => Number(value));
  const from = channels(a);
  const to = channels(b);
  const t = clamp(amount);
  return `rgb(${from.map((value, index) => Math.round(value * (1 - t) + to[index] * t)).join(', ')})`;
}

/** Shared sky art direction for the five transparent foreground scenes. */
export function layeredArt(
  profile: AtmosphereProfile,
  ceilingFt: number | null,
) {
  const day = profile.daylight;
  const cover = profile.known ? profile.cloudCover : 0;
  const ceiling = clamp((ceilingFt ?? 4500) / 6000);
  const grayTop = mixColor('#19243b', '#657a89', day);
  const grayHorizon = mixColor('#48536c', '#b6c3cb', day);
  return {
    skyTop: profile.known
      ? mixColor(profile.skyTop, grayTop, cover * 0.94)
      : mixColor('#26344c', '#8193a0', day),
    skyHorizon: profile.known
      ? mixColor(profile.skyHorizon, grayHorizon, cover * 0.9)
      : mixColor('#626b80', '#b3bec5', day),
    cloudOpacity: profile.known ? clamp((cover - 0.08) / 0.72) : 0,
    cloudTop: 10 + (1 - ceiling) * 25,
    orbOpacity: profile.known ? clamp(1 - cover * 1.5) : 0,
    distanceVeil: profile.known
      ? clamp(Math.max(profile.distanceVeil * 1.8, profile.haze * 0.95))
      : 0,
    drift: profile.known ? Math.round(profile.windX * 45) : 0,
    hazeColor: mixColor('#9aa7b8', '#d2dce0', day),
  };
}
