/**
 * Regenerate the two public-domain geography assets from pinned upstream data.
 * Run: node scripts/generate-geography.mjs
 * Check without writing: node scripts/generate-geography.mjs --check
 * Runs with standard Node.js; no agent-specific tools are required.
 */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';

const naturalEarthRevision = 'ca96624a56bd078437bca8184e78163e5039ad19';
const ourAirportsRevision = 'ecead39624006017b34acf27a4b098c9cc8a4635';
const naturalEarthRoot = `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${naturalEarthRevision}`;
const ourAirportsRoot = `https://raw.githubusercontent.com/davidmegginson/ourairports-data/${ourAirportsRevision}`;

async function download(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`${response.status} downloading ${url}`);
  return response.text();
}

// RFC 4180 quoted fields, including embedded commas, escaped quotes and newlines.
function parseCsv(source) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"') {
      if (quoted && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (character === ',' && !quoted) {
      row.push(field);
      field = '';
    } else if (character === '\n' && !quoted) {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      field = '';
    } else field += character;
  }
  assert.equal(quoted, false, 'Unclosed CSV quote');
  if (field || row.length) rows.push([...row, field.replace(/\r$/, '')]);
  const columns = rows.shift();
  return rows
    .filter((values) => values.length === columns.length)
    .map((values) =>
      Object.fromEntries(columns.map((name, index) => [name, values[index]])),
    );
}

const [rawLand, rawAirports, rawCountries] = await Promise.all([
  download(`${naturalEarthRoot}/geojson/ne_110m_land.geojson`),
  download(`${ourAirportsRoot}/airports.csv`),
  download(`${ourAirportsRoot}/countries.csv`),
]);

const landSource = JSON.parse(rawLand);
const polygons = landSource.features.flatMap(({ geometry }) => {
  assert.ok(['Polygon', 'MultiPolygon'].includes(geometry.type));
  return geometry.type === 'MultiPolygon'
    ? geometry.coordinates
    : [geometry.coordinates];
});
// The source is already generalized to 1:110 million. Quantization reduces the
// payload without removing small islands or changing antimeridian connections.
// Preserve Natural Earth's clockwise outer rings, which d3-geo expects.
const land = {
  type: 'MultiPolygon',
  coordinates: polygons.map((polygon) =>
    polygon.map((ring) => {
      const rounded = ring
        .map(([lon, lat]) => {
          assert.ok(Number.isFinite(lat) && lat >= -90 && lat <= 90);
          assert.ok(Number.isFinite(lon) && lon >= -180 && lon <= 180);
          return [Math.round(lon * 100) / 100, Math.round(lat * 100) / 100];
        })
        .filter(
          (point, index, all) =>
            index === 0 ||
            point[0] !== all[index - 1][0] ||
            point[1] !== all[index - 1][1],
        );
      assert.ok(rounded.length >= 4, 'Collapsed land ring');
      assert.deepEqual(rounded[0], rounded.at(-1), 'Unclosed land ring');
      return rounded;
    }),
  ),
};

const countries = new Map(
  parseCsv(rawCountries).map((country) => [country.code, country.name]),
);
const records = new Map();
for (const airport of parseCsv(rawAirports)) {
  const icao = [airport.icao_code, airport.gps_code, airport.ident].find(
    (code) => /^[A-Z]{4}$/.test(code),
  );
  if (!icao || !/^[A-Z]{3}$/.test(airport.iata_code)) continue;
  if (
    icao !== 'KBOS' &&
    !['medium_airport', 'large_airport'].includes(airport.type)
  )
    continue;
  const lat = Number(airport.latitude_deg);
  const lon = Number(airport.longitude_deg);
  const country = countries.get(airport.iso_country);
  if (
    !airport.latitude_deg ||
    !airport.longitude_deg ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    Math.abs(lat) > 90 ||
    Math.abs(lon) > 180 ||
    !country
  )
    continue;
  assert.ok(!records.has(icao), `Duplicate airport identifier ${icao}`);
  records.set(icao, {
    code: airport.iata_code,
    city: airport.municipality || airport.name,
    country,
    lat: Math.round(lat * 10_000) / 10_000,
    lon: Math.round(lon * 10_000) / 10_000,
  });
}
const airports = Object.fromEntries(
  [...records].sort(([a], [b]) => a.localeCompare(b, 'en')),
);
assert.equal(airports.KBOS.code, 'BOS');
assert.equal(airports.KBOS.city, 'Boston');
assert.equal(airports.LPPT.country, 'Portugal');
assert.ok(records.size > 2_000);

const files = [
  ['lib/globe-land.json', `${JSON.stringify(land)}\n`, 100_000],
  ['lib/airport-metadata.json', `${JSON.stringify(airports)}\n`, 600_000],
];
const checkOnly = process.argv.includes('--check');
for (const [path, content, maximumBytes] of files) {
  const bytes = Buffer.byteLength(content);
  assert.ok(
    bytes <= maximumBytes,
    `${path}: ${bytes} exceeds ${maximumBytes} bytes`,
  );
  let previous;
  try {
    previous = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (checkOnly) {
    assert.equal(previous, content, `${path} needs regeneration`);
  } else if (previous !== content) {
    writeFileSync(new URL(`../${path}`, import.meta.url), content);
  }
  console.log(
    `${checkOnly ? 'Verified' : 'Generated'} ${path}: ${bytes.toLocaleString('en')} bytes`,
  );
}
console.log(`${polygons.length} land polygons; ${records.size} airports`);
