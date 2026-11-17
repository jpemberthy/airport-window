import { createServer } from 'vite';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
const server = await createServer({
  configFile: false,
  server: { middlewareMode: true },
  appType: 'custom',
});
try {
  const { default: airport } = await server.ssrLoadModule('/airport.config.ts');
  const assets = Object.values(airport.scenes).flatMap((scene) =>
    Object.values(scene),
  );
  if (airport.sharedArt) assets.push(...Object.values(airport.sharedArt));
  if (airport.map) assets.push(...Object.values(airport.map.assets));
  for (const asset of assets) {
    if (
      !asset.startsWith('/') ||
      asset.includes('..') ||
      !existsSync(resolve('public', asset.slice(1)))
    )
      throw new Error(`Missing/invalid local asset: ${asset}`);
  }
  console.log(
    `${airport.brand.title}: ${airport.icao}/${airport.iata}, ${airport.timeZone}, ${assets.length} local assets verified.`,
  );
  console.log(
    `Tower: ${Boolean(airport.tower)}; registered map: ${Boolean(airport.map)}. No network requests made.`,
  );
  if (process.argv.includes('--live')) {
    const urls = {
      positions: `https://api.adsb.lol/v2/point/${airport.center.lat}/${airport.center.lon}/${airport.radiusNm}`,
      fallback: `https://opendata.adsb.fi/api/v3/lat/${airport.center.lat}/lon/${airport.center.lon}/dist/${airport.radiusNm}`,
      weather: `https://aviationweather.gov/api/data/metar?ids=${airport.weatherStation}&format=json`,
    };
    for (const [name, url] of Object.entries(urls)) {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'AirportWindow/1.0 (coverage check)' },
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok || response.status === 204)
        throw new Error(`${name}: HTTP ${response.status}`);
      const data = await response.json();
      console.log(
        `${name}: HTTP ${response.status}; ${Array.isArray(data) ? data.length + ' weather reports' : (data.ac ?? data.aircraft ?? []).length + ' aircraft in area'}`,
      );
    }
    console.log(
      'A spot check is not a coverage guarantee. Recheck from your deployment host.',
    );
  }
} finally {
  await server.close();
}
