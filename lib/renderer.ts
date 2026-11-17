import { project, type Coordinate } from './geo';
import type { ActivityKind } from './flight-activity';
import { sampleTrack } from './tracks';
import type { TrackHistory, WeatherSnapshot } from './types';

export interface MapFeature {
  kind: string;
  name?: string;
  coordinates: Coordinate[];
}
export interface MapData {
  features: MapFeature[];
  runways: {
    name: string;
    start: Coordinate;
    end: Coordinate;
    width: number;
  }[];
}
export interface View {
  zoom: number;
  center: Coordinate;
}
export interface SceneState {
  /** Shared display clock, when the caller already owns one. */
  now?: number;
  view: View;
  tracks: Map<string, TrackHistory>;
  weather: WeatherSnapshot;
  daylight: number;
  selectedId: string | null;
  reducedMotion: boolean;
  /** Present only for the read-only TV airspace interlude. */
  activityKinds?: ReadonlyMap<string, ActivityKind>;
}
export interface Hit {
  id: string;
  x: number;
  y: number;
  radius: number;
}
type Context = CanvasRenderingContext2D;
const mix = (a: string, b: string, t: number) => {
  const p = (s: string, i: number) => parseInt(s.slice(i, i + 2), 16);
  return `rgb(${[1, 3, 5].map((i) => Math.round(p(a, i) * (1 - t) + p(b, i) * t)).join(',')})`;
};
export function palette(light: number) {
  return {
    water: mix('#091a2d', '#315e69', light),
    ripple: mix('#174a61', '#789b99', light),
    land: mix('#172b37', '#607c76', light),
    airport: mix('#26354a', '#829688', light),
    grass: mix('#233c42', '#758e7d', light),
    apron: mix('#35465d', '#93a39b', light),
    taxi: mix('#56677d', '#adaf99', light),
    runway: mix('#0e192c', '#536d73', light),
    building: mix('#536f80', '#b9c6bb', light),
    edge: mix('#345d72', '#acc7b8', light),
    text: mix('#9fc7d1', '#264c55', light),
  };
}
function polygon(
  c: Context,
  coordinates: Coordinate[],
  at: (p: Coordinate) => Coordinate,
) {
  c.beginPath();
  coordinates.forEach((p, i) => {
    const [x, y] = at(p);
    if (i) c.lineTo(x, y);
    else c.moveTo(x, y);
  });
  c.closePath();
}
function centroid(f: MapFeature): Coordinate {
  const points = f.coordinates;
  return [
    points.reduce((n, p) => n + p[0], 0) / points.length,
    points.reduce((n, p) => n + p[1], 0) / points.length,
  ];
}
export function drawSprite(
  c: Context,
  image: HTMLImageElement,
  index: number,
  x: number,
  y: number,
  width: number,
  height = width,
) {
  const cell = image.width / 4;
  c.drawImage(
    image,
    (index % 4) * cell,
    Math.floor(index / 4) * cell,
    cell,
    cell,
    Math.round(x - width / 2),
    Math.round(y - height / 2),
    width,
    height,
  );
}

// Geography is painted once per view / sunlight change. Only water, aircraft,
// weather and light beacons are repainted on the animation loop.
export function groundLayer(
  map: MapData,
  buildings: HTMLImageElement,
  w: number,
  h: number,
  state: SceneState,
) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const c = canvas.getContext('2d')!;
  c.imageSmoothingEnabled = false;
  const p = palette(state.daylight),
    at = (coord: Coordinate) =>
      project(...coord, w, h, state.view.zoom, state.view.center),
    scale = Math.min(w / 5500, h / 3400) * state.view.zoom,
    night = 1 - state.daylight,
    activityOverview = state.activityKinds !== undefined;
  for (const f of map.features) {
    if (!f.coordinates.length || f.kind === 'tower') continue;
    if (f.kind === 'coastline') {
      if (activityOverview) {
        c.save();
        c.beginPath();
        f.coordinates.forEach((coordinate, index) => {
          const [x, y] = at(coordinate);
          if (index) c.lineTo(x, y);
          else c.moveTo(x, y);
        });
        c.strokeStyle = '#061523';
        c.globalAlpha = 0.52;
        c.lineWidth = 2.4;
        c.stroke();
        c.strokeStyle = p.edge;
        c.globalAlpha = 0.7;
        c.lineWidth = 0.8;
        c.stroke();
        c.restore();
      }
      continue;
    }
    // The source land polygons close beyond the harbor extract. Those
    // closures become giant wedges in a centered TV frame, so this read-only
    // view uses real coast paths plus only the self-contained harbor islands.
    if (activityOverview && f.kind === 'land') {
      const longitudes = f.coordinates.map(([longitude]) => longitude),
        latitudes = f.coordinates.map(([, latitude]) => latitude);
      if (
        Math.max(...longitudes) - Math.min(...longitudes) > 0.04 ||
        Math.max(...latitudes) - Math.min(...latitudes) > 0.04
      )
        continue;
      c.save();
      polygon(c, f.coordinates, at);
      c.fillStyle = p.land;
      c.globalAlpha = 0.34;
      c.fill();
      c.restore();
      continue;
    }
    if (activityOverview && ['city', 'building', 'hangar'].includes(f.kind))
      continue;
    if (f.kind === 'road') {
      c.beginPath();
      f.coordinates.forEach((v, i) => {
        const [x, y] = at(v);
        if (i) c.lineTo(x, y);
        else c.moveTo(x, y);
      });
      c.strokeStyle = night > 0.5 ? '#536274' : '#c2c8b4';
      c.lineWidth = Math.max(1, 10 * scale);
      c.stroke();
      continue;
    }
    if (f.kind === 'taxiway') {
      c.beginPath();
      f.coordinates.forEach((v, i) => {
        const [x, y] = at(v);
        if (i) c.lineTo(x, y);
        else c.moveTo(x, y);
      });
      c.strokeStyle = p.taxi;
      c.lineWidth = Math.max(1, 22 * scale);
      c.lineCap = 'round';
      c.stroke();
      if (scale > 0.06) {
        c.strokeStyle = '#e3cc86';
        c.lineWidth = 0.65;
        c.stroke();
      }
      continue;
    }
    polygon(c, f.coordinates, at);
    c.fillStyle =
      f.kind === 'land'
        ? p.land
        : f.kind === 'aerodrome'
          ? p.airport
          : f.kind === 'apron'
            ? p.apron
            : f.kind === 'grass'
              ? p.grass
              : f.kind === 'city'
                ? mix('#354958', '#a5b9af', state.daylight)
                : p.building;
    if (['terminal', 'building', 'hangar'].includes(f.kind)) {
      c.save();
      c.translate(2, 3);
      c.fillStyle = '#122f3b77';
      c.fill();
      c.restore();
      c.fillStyle = p.building;
    }
    c.fill();
    if (f.kind === 'land' || f.kind === 'aerodrome') {
      c.strokeStyle = p.edge;
      c.lineWidth = f.kind === 'land' ? 1.5 : 1;
      c.stroke();
    }
    if (
      ['terminal', 'building', 'hangar', 'city'].includes(f.kind) &&
      scale > 0.065
    ) {
      const pts = f.coordinates.map(at),
        height = f.kind === 'terminal' ? 3 : f.kind === 'city' ? 1.5 : 2;
      c.beginPath();
      pts.forEach(([x, y], i) => {
        if (i) c.lineTo(x, y - height);
        else c.moveTo(x, y - height);
      });
      c.closePath();
      c.fillStyle =
        f.kind === 'city'
          ? mix('#41576a', '#b4c4b7', state.daylight)
          : p.building;
      c.fill();
      c.strokeStyle =
        night > 0.5
          ? f.kind === 'terminal'
            ? '#8b92cd'
            : '#557081'
          : '#dee6ce';
      c.lineWidth = 0.6;
      c.stroke();
      if (night > 0.4) {
        c.fillStyle = f.kind === 'terminal' ? '#a9dbea' : '#99b3b6';
        c.globalAlpha = f.kind === 'city' ? 0.35 : 0.7;
        for (let i = 0; i < pts.length; i += f.kind === 'terminal' ? 3 : 8) {
          const a = pts[i],
            b = pts[(i + 1) % pts.length];
          if (Math.hypot(a[0] - b[0], a[1] - b[1]) > 3)
            c.fillRect(a[0], a[1], 1.5, 1);
        }
        c.globalAlpha = 1;
      }
    }
  }
  // Threshold locations come directly from OurAirports. Their projection is
  // identical to the live aircraft projection below.
  for (const r of map.runways) {
    const a = at(r.start),
      b = at(r.end),
      dx = b[0] - a[0],
      dy = b[1] - a[1],
      len = Math.hypot(dx, dy),
      width = Math.max(3, r.width * scale),
      nx = -dy / len,
      ny = dx / len;
    c.beginPath();
    c.moveTo(...a);
    c.lineTo(...b);
    c.strokeStyle = p.runway;
    c.lineWidth = width;
    c.lineCap = 'butt';
    c.stroke();
    c.setLineDash([Math.max(2, 35 * scale), Math.max(3, 55 * scale)]);
    c.strokeStyle = '#edf3d7aa';
    c.lineWidth = 0.7;
    c.stroke();
    c.setLineDash([]);
    if (scale > 0.04) {
      c.shadowColor = '#55c9ff';
      c.shadowBlur = night * 3;
      for (let j = 0; j <= 36; j++) {
        const t = j / 36;
        for (const side of [-1, 1]) {
          c.fillStyle =
            j < 2 || j > 34 ? '#b3ffd9' : night > 0.5 ? '#8cecff' : '#dfe8cc';
          c.fillRect(
            Math.round(a[0] + dx * t + nx * side * width * 0.55),
            Math.round(a[1] + dy * t + ny * side * width * 0.55),
            1.2,
            1.2,
          );
        }
      }
      c.shadowBlur = 0;
      for (const t of [0.025, 0.975]) {
        for (const shift of [-0.3, 0, 0.3]) {
          c.beginPath();
          c.moveTo(
            a[0] + dx * t + nx * width * shift,
            a[1] + dy * t + ny * width * shift,
          );
          c.lineTo(
            a[0] + dx * (t + 0.012) + nx * width * shift,
            a[1] + dy * (t + 0.012) + ny * width * shift,
          );
          c.strokeStyle = '#e2ebd3';
          c.lineWidth = 0.75;
          c.stroke();
        }
      }
    }
    if (scale > 0.08) {
      c.font = '8px monospace';
      c.fillStyle = p.text;
      r.name.split('/').forEach((name, i) => {
        const v = i ? b : a;
        c.fillText(name, v[0] + nx * 10 + 3, v[1] + ny * 10);
      });
    }
  }
  // Raster building accents sit on the actual OSM footprints; the footprint
  // remains visible underneath, preserving the airport's distinctive shape.
  let accents = map.features
    .filter((f) => ['terminal', 'tower', 'hangar'].includes(f.kind))
    .sort((a, b) => at(centroid(a))[1] - at(centroid(b))[1]);
  if (activityOverview) {
    const distinct = new Map<string, MapFeature>();
    for (const feature of accents) {
      const key = `${feature.kind}:${feature.name ?? 'unnamed'}`;
      if (
        !distinct.has(key) ||
        distinct.get(key)!.coordinates.length < feature.coordinates.length
      )
        distinct.set(key, feature);
    }
    accents = [...distinct.values()].sort(
      (a, b) => at(centroid(a))[1] - at(centroid(b))[1],
    );
  }
  if (scale > 0.04) {
    for (const f of accents) {
      if (f.coordinates.length < 10) continue;
      const points = f.coordinates.map(at),
        xs = points.map((v) => v[0]),
        anchor = at(centroid(f));
      const width =
        f.kind === 'tower'
          ? Math.max(25, 190 * scale)
          : Math.max(
              25,
              Math.min(
                145 * state.view.zoom,
                Math.max(...xs) - Math.min(...xs),
              ),
            );
      const index =
        f.kind === 'tower'
          ? 2
          : f.kind === 'hangar'
            ? 3
            : f.name?.includes('Satellite')
              ? 0
              : f.name === 'Terminal A'
                ? 5
                : 1;
      c.globalAlpha = activityOverview ? 0.68 : 0.95;
      drawSprite(
        c,
        buildings,
        index,
        anchor[0],
        anchor[1] - (f.kind === 'tower' ? width * 0.28 : width * 0.1),
        width,
      );
      c.globalAlpha = 1;
      if (night > 0.2) {
        c.fillStyle = `rgba(94,235,245,${night * 0.6})`;
        for (let i = 0; i < 5; i++)
          c.fillRect(
            anchor[0] - width * 0.21 + i * width * 0.08,
            anchor[1] + width * 0.08,
            2,
            1,
          );
      }
    }
  }
  // Terminal labels use actual terminal locations, never gate assignments.
  if (scale > 0.07) {
    const labels: [string, Coordinate][] = [
      ['A', [-71.0229, 42.3651]],
      ['B', [-71.0192, 42.3621]],
      ['C', [-71.0171, 42.3678]],
      ['E', [-71.0202, 42.3705]],
    ];
    for (const [label, coord] of labels) {
      const [x, y] = at(coord);
      c.fillStyle = night > 0.5 ? '#182e43dd' : '#315f65da';
      c.fillRect(Math.round(x) - 7, Math.round(y) - 17, 15, 14);
      c.fillStyle = '#def3e3';
      c.font = 'bold 9px monospace';
      c.textAlign = 'center';
      c.fillText(label, Math.round(x) + 0.5, Math.round(y) - 7);
    }
    c.textAlign = 'left';
  }
  if (night > 0.3) {
    c.globalAlpha = night * 0.28;
    for (const f of map.features.filter((f) => f.kind === 'taxiway')) {
      c.fillStyle = '#789dff';
      for (let i = 0; i < f.coordinates.length; i += 4) {
        const [x, y] = at(f.coordinates[i]);
        c.fillRect(x, y, 1, 1);
      }
    }
    c.globalAlpha = 1;
  }
  return canvas;
}

export function drawScene(
  c: Context,
  base: HTMLCanvasElement,
  aircraft: HTMLImageElement,
  state: SceneState,
  now: number,
): Hit[] {
  const w = c.canvas.width,
    h = c.canvas.height,
    p = palette(state.daylight),
    time = state.reducedMotion ? 0 : now / 1000,
    at = (p: Coordinate) =>
      project(...p, w, h, state.view.zoom, state.view.center),
    hits: Hit[] = [];
  c.imageSmoothingEnabled = false;
  c.fillStyle = p.water;
  c.fillRect(0, 0, w, h);
  const windStrength = 1 + Math.min(35, state.weather.windSpeedKt ?? 0) * 0.045,
    windBearing =
      (((state.weather.windDirection ?? 270) + 180) * Math.PI) / 180,
    windX = 0.92 * Math.sin(windBearing) + 0.32 * Math.cos(windBearing);
  c.fillStyle = p.ripple;
  for (let i = 0; i < 450; i++) {
    const x =
        ((((Math.sin(i * 73.7) * 0.5 + 0.5) * w +
          time * (0.8 + (i % 3)) * windStrength * windX * 0.5) %
          w) +
          w) %
        w,
      y = (Math.cos(i * 83.1) * 0.5 + 0.5) * h;
    c.globalAlpha = 0.12 + (Math.sin(time * 0.7 + i) * 0.5 + 0.5) * 0.2;
    c.fillRect(Math.round(x), Math.round(y), 2 + (i % 6), 1);
  }
  c.globalAlpha = 1;
  c.drawImage(base, 0, 0);
  const scale = Math.min(w / 5500, h / 3400) * state.view.zoom;
  const activityMode = state.activityKinds !== undefined;
  const ordered = [...state.tracks.values()]
    .map((t) => ({
      track: sampleTrack(t, now, state.reducedMotion),
      history: t,
    }))
    .filter((t) => t.track.opacity > 0)
    .sort((a, b) => (a.track.altitudeFt ?? 0) - (b.track.altitudeFt ?? 0));
  for (const { track: t, history } of ordered) {
    const [gx, gy] = at([t.lon, t.lat]);
    const lift =
      t.onGround === true
        ? 0
        : t.altitudeFt === null
          ? 0
          : Math.min(82, Math.max(0, t.altitudeFt - 20) * 0.011) *
            Math.min(1.5, Math.sqrt(state.view.zoom));
    const x = gx,
      y = gy - lift;
    if (x < -50 || x > w + 50 || y < -70 || y > h + 70) continue;
    const heading = t.heading ?? 0,
      radians = (heading * Math.PI) / 180,
      dx = 0.92 * Math.sin(radians) + 0.32 * Math.cos(radians),
      dy = 0.16 * Math.sin(radians) - 0.66 * Math.cos(radians),
      angle = Math.atan2(dx, -dy);
    const size =
      Math.max(
        activityMode ? 7 : 12,
        Math.min(activityMode ? 34 : 54, 33 * Math.sqrt(state.view.zoom)) *
          Math.min(1, Math.max(activityMode ? 0.4 : 0.55, w / 1000)),
      ) * (t.aircraftType?.match(/^(C1|C2|PA|SR2|BE)/) ? 0.8 : 1);
    const activityKind = state.activityKinds?.get(t.id) ?? 'other';
    const activityColor =
      activityKind === 'inbound'
        ? '#ffbe8c'
        : activityKind === 'outbound'
          ? '#83eee4'
          : activityKind === 'ground'
            ? '#d9c98b'
            : '#92a8b6';
    if (activityMode) {
      c.save();
      c.globalAlpha =
        t.opacity *
        (activityKind === 'other'
          ? 0.2
          : activityKind === 'ground'
            ? 0.38
            : 0.58);
      c.strokeStyle = activityColor;
      c.shadowColor = activityColor;
      c.shadowBlur = Math.max(2, size * 0.25);
      c.lineWidth = t.id === state.selectedId ? 1.35 : 0.7;
      c.beginPath();
      c.moveTo(x - dx * size * 2.2, y + dy * size * 2.2);
      c.lineTo(x - dx * size * 0.68, y + dy * size * 0.68);
      c.stroke();
      c.fillStyle = activityColor;
      c.globalAlpha *= 0.62;
      c.fillRect(Math.round(x), Math.round(y), 2, 2);
      c.restore();
    }
    c.save();
    c.globalAlpha = t.opacity * (t.onGround ? 0.22 : 0.12);
    c.translate(gx + lift * 0.3, gy + lift * 0.18);
    c.rotate(angle);
    c.fillStyle = '#041725';
    c.beginPath();
    c.ellipse(0, 0, size * 0.29, size * 0.12, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();
    if (t.id === state.selectedId) {
      if (history.previous) {
        const prev = at([history.previous.lon, history.previous.lat]);
        c.beginPath();
        c.moveTo(...prev);
        c.lineTo(gx, gy);
        c.strokeStyle = '#c7ffee77';
        c.setLineDash([2, 3]);
        c.lineWidth = 1;
        c.stroke();
        c.setLineDash([]);
      }
      c.strokeStyle = '#c5ffe0';
      c.lineWidth = 1;
      c.beginPath();
      c.ellipse(x, y, size * 0.67, size * 0.49, 0, 0, Math.PI * 2);
      c.stroke();
    }
    c.save();
    c.globalAlpha =
      t.opacity * (activityMode && activityKind === 'other' ? 0.62 : 1);
    c.translate(x, y);
    c.rotate(angle);
    drawSprite(
      c,
      aircraft,
      !t.airline.code && t.aircraftType?.match(/^(C1|PA|SR2|BE)/)
        ? 7
        : t.airline.sprite,
      0,
      0,
      size,
    );
    if (t.airline.code && t.airline.sprite === 6) {
      c.fillStyle = t.airline.color;
      c.fillRect(-1, size * 0.21, 2, size * 0.1);
    }
    c.restore();
    if (state.daylight < 0.4) {
      c.globalAlpha = t.opacity * 0.7;
      c.fillStyle = '#b3fff4';
      c.fillRect(x - 1, y + 1, 2, 1);
      if (
        !state.reducedMotion &&
        Math.sin(time * 3 + t.id.charCodeAt(0)) > 0.92
      ) {
        c.fillStyle = '#fbb8a7';
        c.fillRect(x - 1, y, 2, 2);
      }
      c.globalAlpha = 1;
    }
    if (t.id === state.selectedId) {
      c.font = '10px monospace';
      const label = t.callsign ?? t.registration ?? t.id,
        labelWidth = c.measureText(label).width;
      c.fillStyle = '#0c2138ed';
      c.fillRect(
        x - labelWidth / 2 - 6,
        y - size * 0.62 - 17,
        labelWidth + 12,
        18,
      );
      c.fillStyle = '#e2f9e7';
      c.textAlign = 'center';
      c.fillText(label, x, y - size * 0.62 - 5);
      c.textAlign = 'left';
    }
    hits.push({ id: t.id, x, y, radius: Math.max(16, size * 0.6) });
  }
  const cloud = state.weather.cloudCover ?? 0;
  if (cloud > (activityMode ? 0.45 : 0.2)) {
    c.fillStyle = state.daylight > 0.5 ? '#dfede0' : '#41556b';
    c.globalAlpha = cloud * 0.09;
    for (let i = 0; i < 7; i++) {
      const x =
          ((((i * 257 + time * 2 * windStrength * windX) % (w + 300)) +
            (w + 300)) %
            (w + 300)) -
          150,
        y = h * (0.12 + ((i * 0.173) % 0.72));
      c.fillRect(x, y, 110, 22);
      c.fillRect(x + 15, y - 10, 70, 10);
      c.fillRect(x - 25, y + 8, 170, 8);
    }
    c.globalAlpha = 1;
  }
  if (state.weather.fog) {
    c.fillStyle = state.daylight > 0.5 ? '#d0ddd2' : '#8fa3b3';
    c.globalAlpha =
      state.weather.visibilityMiles !== null &&
      state.weather.visibilityMiles < 1
        ? 0.34
        : 0.18;
    c.fillRect(0, 0, w, h);
    c.globalAlpha = 1;
  }
  if (state.weather.precipitation) {
    const snow = state.weather.precipitation === 'snow',
      wind = Math.min(25, state.weather.windSpeedKt ?? 0),
      windAngle =
        (((state.weather.windDirection ?? 270) + 180) * Math.PI) / 180,
      drift = Math.sin(windAngle) * wind * 0.7;
    c.fillStyle = snow ? '#f0f9ed' : '#abdce9';
    c.strokeStyle = '#b4d6e38c';
    c.lineWidth = 0.7;
    c.globalAlpha = snow ? 0.75 : 0.5;
    for (let i = 0; i < (snow ? 80 : 150); i++) {
      const x = (((i * 137.3 + time * (drift + (snow ? 3 : 12))) % w) + w) % w,
        y = (i * 97.9 + time * (snow ? 11 : 180)) % h;
      if (snow)
        c.fillRect(Math.round(x), Math.round(y), i % 3 === 0 ? 2 : 1, 1);
      else {
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x + drift * 0.3, y + 7);
        c.stroke();
      }
    }
    c.globalAlpha = 1;
  }
  // A restrained twilight tint brings warm sunset into the harbor palette.
  if (state.daylight > 0.1 && state.daylight < 0.8) {
    c.globalAlpha = Math.sin(state.daylight * Math.PI) * 0.055;
    c.fillStyle = '#e99fbc';
    c.fillRect(0, 0, w, h);
    c.globalAlpha = 1;
  }
  if (scale > 0.04) {
    const [x, y] = at([-70.995, 42.35]);
    c.fillStyle = p.text;
    c.globalAlpha = 0.65;
    c.font = '10px monospace';
    c.fillText('B O S T O N  H A R B O R', x - 40, y);
    c.globalAlpha = 1;
  }
  return hits;
}
