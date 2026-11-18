// Deterministic geographic scaffold for the authored AEP illustration.
// Regenerate from the bundled ODbL source; no network request or image model.
import { readFileSync, writeFileSync } from 'node:fs';
const { ways } = JSON.parse(readFileSync('public/data/aep-map.json', 'utf8'));
export const projection = {
  a: 1,
  b: 0,
  c: 0,
  d: -0.65,
  scale: 0.43,
  width: 1672,
  height: 941,
};
export const origin = { lon: -58.416, lat: -34.559 };
export function project([lon, lat]) {
  return [
    836 +
      (lon - origin.lon) *
        111320 *
        Math.cos((-34.5594 * Math.PI) / 180) *
        projection.scale,
    470.5 + (lat - origin.lat) * 111320 * projection.d * projection.scale,
  ];
}
const line = (points) =>
  points
    .map((p) =>
      project(p)
        .map((x) => x.toFixed(2))
        .join(','),
    )
    .join(' ');
const coast = ways
  .filter((w) => w.tags.natural === 'coastline')
  .map((w) => w.coordinates);
const joined = coast.shift();
while (coast.length) {
  let found = false;
  for (let i = 0; i < coast.length; i++) {
    if (JSON.stringify(coast[i][0]) === JSON.stringify(joined.at(-1))) {
      joined.push(...coast.splice(i, 1)[0].slice(1));
      found = true;
      break;
    }
    if (JSON.stringify(coast[i].at(-1)) === JSON.stringify(joined[0])) {
      joined.unshift(...coast.splice(i, 1)[0].slice(0, -1));
      found = true;
      break;
    }
  }
  if (!found) throw new Error('Coastline must be one connected chain');
}
const svg = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="1672" height="941" viewBox="0 0 1672 941">',
  '<rect width="1672" height="941" fill="#3b91ac"/>',
];
svg.push(
  `<polygon points="${line(joined)} -2000,-2000 -2000,3000 3000,3000" fill="#b4c49a"/>`,
);
const polygon = (w, fill, stroke = fill) =>
  svg.push(
    `<polygon points="${line(w.coordinates)}" fill="${fill}" stroke="${stroke}" stroke-width="1"/>`,
  );
const stroke = (w, color, width, extras = '') =>
  svg.push(
    `<polyline points="${line(w.coordinates)}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linejoin="round" ${extras}/>`,
  );
for (const w of ways)
  if (w.tags.leisure || w.tags.landuse === 'grass') polygon(w, '#7caa67');
for (const w of ways) if (w.tags.natural === 'water') polygon(w, '#3b91ac');
for (const w of ways) if (w.tags.aeroway === 'aerodrome') polygon(w, '#a8b997');
for (const w of ways)
  if (
    w.tags.highway &&
    !['footway', 'path', 'steps', 'cycleway'].includes(w.tags.highway)
  )
    stroke(
      w,
      '#d2cab9',
      ['motorway', 'trunk', 'primary'].includes(w.tags.highway) ? 9 : 4,
    );
for (const w of ways)
  if (w.tags.building && w.tags.building !== 'no')
    polygon(w, '#e3d8c1', '#9e9d8f');
for (const w of ways)
  if (w.tags.aeroway === 'apron') polygon(w, '#c9c5b3', '#9a9b91');
for (const w of ways)
  if (w.tags.aeroway === 'taxiway') {
    stroke(w, '#7b8788', 9);
    stroke(w, '#e0cd7c', 1);
  }
for (const w of ways)
  if (['terminal', 'hangar'].includes(w.tags.aeroway))
    polygon(w, '#7297ac', '#52687a');
for (const w of ways)
  if (w.tags.aeroway === 'runway') {
    stroke(w, '#303a46', 21);
    stroke(w, '#eae8db', 1.5, 'stroke-dasharray="12 12"');
  }
svg.push('</svg>');
writeFileSync('public/airports/aep/map/guide.svg', svg.join('\n') + '\n');
const endpoints = [
  [-58.4282863, -34.5522719],
  [-58.4041907, -34.5656923],
];
console.log(
  'Runway physical endpoints in guide pixels:',
  endpoints.map(project),
);
console.log('Wrote public/airports/aep/map/guide.svg');
