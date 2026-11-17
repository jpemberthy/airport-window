import { airport } from './airport';
import type { AtmosphereProfile } from './atmosphere';
import {
  harborHeading,
  HARBOR_WIDTH,
  type HarborFrame,
  type HarborView,
} from './harbor-view';

const colors = {
  inbound: '#ffd4a4',
  outbound: '#9be9e7',
  ground: '#c3b1ef',
  other: '#bdc9dc',
};
export function harborDayMix(daylight: number) {
  const t = Math.min(1, Math.max(0, (daylight - 0.04) / 0.92));
  return t * t * (3 - 2 * t);
}
/** Keep an authored direction until five degrees beyond its usual boundary. */
export function harborSpriteDirection(heading: number, previous?: number) {
  const angle = ((heading % 360) + 360) % 360;
  if (
    previous !== undefined &&
    Math.abs(((angle - previous * 45 + 540) % 360) - 180) <= 27.5
  )
    return previous;
  return Math.round(angle / 45) % 8;
}
export function drawHarbor(
  c: CanvasRenderingContext2D,
  sprite: HTMLImageElement,
  view: HarborView,
  frame: HarborFrame,
  profile: AtmosphereProfile,
  wind: { direction: number | null; speed: number | null },
  focusedId: string | null,
  time: number,
  reduced: boolean,
  directions?: Map<string, number>,
) {
  const { width: w, height: h } = frame;
  c.clearRect(0, 0, w, h);
  const seconds = reduced ? 0 : time / 1000;
  const angle =
    (harborHeading(
      airport.map?.origin.lon ?? airport.center.lon,
      airport.map?.origin.lat ?? airport.center.lat,
      (wind.direction ?? 270) + 180,
    ) *
      Math.PI) /
    180;
  const strength = profile.known
    ? 0.12 + Math.min(45, wind.speed ?? 0) * 0.013
    : 0;
  const drift = Math.sin(angle) * strength;
  // Overhead cloud shadows, not a second horizon or opaque foreground clouds.
  for (let i = 0; i < 5 && profile.cloudCover > 0.1; i++) {
    const x =
      ((((i * 391 + seconds * drift * 7) % (w + 600)) + w + 600) % (w + 600)) -
      300;
    const y = h * (0.15 + ((i * 0.211) % 0.7));
    const g = c.createRadialGradient(x, y, 0, x, y, w * 0.27);
    g.addColorStop(0, `rgba(12,20,40,${profile.cloudCover * 0.16})`);
    g.addColorStop(1, 'rgba(12,20,40,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
  }
  if (profile.precipitation) {
    const count = Math.min(
      200,
      Math.round((w * h * profile.particleDensity) / 1e6),
    );
    for (let i = 0; i < count; i++) {
      const snow =
        profile.precipitation === 'snow' ||
        (profile.precipitation === 'mixed' && i % 3 === 0);
      const speed = snow ? 18 : 150 * profile.fallSpeed;
      const x = (((i * 137.31 + seconds * drift * speed) % w) + w) % w;
      const y = (i * 97.93 + seconds * speed) % h;
      c.fillStyle = snow ? '#eaf8ff9e' : '#b4e3ff66';
      if (snow)
        c.fillRect(Math.round(x), Math.round(y), i % 3 === 0 ? 3 : 2, 2);
      else {
        c.strokeStyle = '#b4e3ff55';
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x + drift * 7, y + 6);
        c.stroke();
      }
    }
  }
  c.imageSmoothingEnabled = false;
  if (directions) {
    const ids = new Set(view.aircraft.map((plane) => plane.id));
    for (const id of directions.keys()) if (!ids.has(id)) directions.delete(id);
  }
  // Featured plane paints last; all positions remain untouched.
  const ordered = view.aircraft
    .filter((p) => p.inView)
    .sort((a, b) => Number(a.id === focusedId) - Number(b.id === focusedId));
  for (const plane of ordered) {
    const { x, y, kind, flight } = plane;
    const focused = plane.id === focusedId;
    const worldWidth = HARBOR_WIDTH * frame.scale;
    const size = Math.round(
      worldWidth * (focused ? 0.043 : kind === 'ground' ? 0.019 : 0.034),
    );
    const edge = Math.min(1, y / (h * 0.13), (h - y) / (h * 0.18));
    c.save();
    c.globalAlpha = flight.opacity * edge * (kind === 'ground' ? 0.68 : 1);
    const halo = c.createRadialGradient(x, y, 0, x, y, size * 0.65);
    halo.addColorStop(0, '#040b1bd4');
    halo.addColorStop(0.45, '#040b1b85');
    halo.addColorStop(1, '#040b1b00');
    c.fillStyle = halo;
    c.fillRect(x - size, y - size, size * 2, size * 2);
    c.shadowColor = colors[kind];
    c.shadowBlur = kind === 'ground' ? 1 : 5;
    if (plane.heading === null) {
      c.fillStyle = colors[kind];
      c.fillRect(x - 3, y - 3, 6, 6);
    } else {
      const direction = harborSpriteDirection(
        plane.heading,
        reduced ? undefined : directions?.get(plane.id),
      );
      directions?.set(plane.id, direction);
      // Keep the authored oblique view; only its small residual angle follows
      // the pavement exactly, so taxiing jets do not crab across their lane.
      c.save();
      if (plane.surfaceAligned) {
        c.translate(x, y);
        c.rotate(
          ((((plane.heading - direction * 45 + 540) % 360) - 180) * Math.PI) /
            180,
        );
      }
      c.drawImage(
        sprite,
        (direction % 4) * 32,
        Math.floor(direction / 4) * 32,
        32,
        32,
        Math.round((plane.surfaceAligned ? 0 : x) - size / 2),
        Math.round((plane.surfaceAligned ? 0 : y) - size / 2),
        size,
        size,
      );
      c.restore();
    }
    c.shadowBlur = 0;
    if (focused && y > h * 0.22 && y < h * (w < 600 ? 0.63 : 0.77)) {
      const font = Math.max(12, Math.min(19, w * 0.012));
      c.font = `600 ${font}px monospace`;
      const label = flight.callsign ?? flight.registration ?? plane.id;
      const labelWidth = c.measureText(label).width + 20;
      const left = Math.max(12, Math.min(w - labelWidth - 12, x + size * 0.35));
      const top = y - size * 0.65;
      c.fillStyle = '#071023e8';
      c.fillRect(left, top, labelWidth, font + 14);
      c.fillStyle = colors[kind];
      c.fillRect(left, top, 2, font + 14);
      c.fillStyle = '#f7f1e9';
      c.fillText(label, left + 10, top + font + 3);
    }
    c.restore();
  }
}
