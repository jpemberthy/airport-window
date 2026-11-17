import { test, expect, type Page } from '@playwright/test';
import airport from '../../airport.config';
import { mkdirSync } from 'node:fs';
const phases = ['approach', 'landing', 'taxi', 'takeoff', 'climb'] as const;
async function fixtures(
  page: Page,
  phase = 'approach',
  light = 'day',
  condition = 'clear',
) {
  const timestamp = new Date(
    light === 'day' ? '2026-11-17T15:00:00Z' : '2026-11-17T04:00:00Z',
  );
  await page.clock.install({ time: timestamp });
  const now = timestamp.getTime();
  const isGround = phase === 'taxi';
  const height = phase === 'landing' ? 150 : phase === 'takeoff' ? 400 : 2500;
  await page.route('**/api/traffic', (route) =>
    route.fulfill({
      json: {
        source: 'ADSB.lol',
        provider: 'adsb-lol',
        observedAt: now,
        receivedAt: now,
        freshness: 'fresh',
        error: null,
        retryAfterSeconds: null,
        aircraft: [
          {
            id: 'abcdef',
            callsign: 'ARG123',
            registration: null,
            aircraftType: 'A320',
            lat: airport.center.lat + 0.01,
            lon: airport.center.lon,
            altitudeFt: isGround ? 0 : airport.elevationFt + height,
            speedKt: isGround ? 18 : 160,
            heading: 180,
            verticalRateFpm: isGround
              ? 0
              : phase === 'takeoff' || phase === 'climb'
                ? 900
                : -500,
            onGround: isGround,
            observedAt: now,
            positionSource: 'adsb-lol',
            airline: {
              name: 'Aerolíneas Argentinas',
              code: 'AR',
              color: '#56b6ec',
              sprite: 0,
            },
          },
        ],
      },
    }),
  );
  await page.route('**/api/weather', (route) =>
    route.fulfill({
      json: {
        station: airport.weatherStation,
        source: 'Synthetic browser test',
        observedAt: now,
        receivedAt: now,
        freshness: 'fresh',
        error: null,
        retryAfterSeconds: null,
        temperatureC: condition === 'snow' ? -1 : 20,
        dewPointC: 14,
        windDirection: 180,
        windSpeedKt: 12,
        windGustKt: 20,
        visibilityMiles: condition === 'fog' ? 0.2 : 10,
        cloudCover: condition === 'clear' ? 0 : 1,
        ceilingFt: condition === 'clear' ? null : 400,
        condition,
        precipitation:
          condition === 'rain' ? 'rain' : condition === 'snow' ? 'snow' : null,
        precipitationIntensity: 'heavy',
        fog: condition === 'fog',
        mist: false,
        thunder: false,
        description: condition,
        raw: null,
      },
    }),
  );
  await page.route('**/api/route?**', (route) =>
    route.fulfill({ json: { status: 'disabled', route: null } }),
  );
}
mkdirSync('.context/screenshots', { recursive: true });
for (const width of [390, 1440])
  test(`${width}px: all phases and day/night artwork`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    for (const light of ['day', 'night'])
      for (const phase of phases) {
        await page.unrouteAll();
        await fixtures(page, phase, light);
        await page.goto('/');
        await expect(page.locator('.moment-card h2')).toContainText(
          phase.charAt(0).toUpperCase() + phase.slice(1),
        );
        const imgs = page.locator(
          '.moment-card .flight-scene img.scene-original',
        );
        await expect(imgs.first()).toBeVisible();
        await expect
          .poll(() =>
            imgs.evaluateAll((images) =>
              images.every(
                (i) =>
                  (i as HTMLImageElement).complete &&
                  (i as HTMLImageElement).naturalWidth > 0,
              ),
            ),
          )
          .toBe(true);
        await expect(
          page.getByRole('button', { name: 'Play tower', exact: true }),
        ).toHaveCount(airport.tower ? 2 : 0);
        expect(
          await page
            .locator('body')
            .evaluate((el) => el.scrollWidth <= window.innerWidth),
        ).toBe(true);
        await page.screenshot({
          path: `.context/screenshots/${airport.id}-${width}-${phase}-${light}.png`,
          fullPage: true,
          animations: 'disabled',
        });
      }
    expect(errors).toEqual([]);
  });
for (const condition of ['rain', 'fog', 'snow'])
  test(`${condition}: desktop and phone`, async ({ page }) => {
    await fixtures(page, 'approach', 'day', condition);
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      await page.goto('/');
      await expect(page.locator('.moment-card h2')).toContainText('Approach');
      await page.screenshot({
        path: `.context/screenshots/${airport.id}-${width}-${condition}.png`,
        fullPage: true,
        animations: 'disabled',
      });
    }
  });
test('optional capabilities, nearby mode, audio and unavailable feeds', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixtures(page);
  await page.goto('/?mode=tv');
  await expect(page.locator('.moment-card h2')).toContainText('Approach');
  if (!airport.map) {
    await expect(
      page.getByRole('button', { name: /Show harbor|Back to stories|Harbor/ }),
    ).toHaveCount(0);
    await expect(page.locator('.living-airspace')).toHaveCount(0);
  }
  if (!airport.tower) await expect(page.locator('audio')).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Play ambience', exact: true })
    .filter({ visible: true })
    .click();
  await expect(
    page
      .getByRole('button', { name: 'Pause ambience', exact: true })
      .filter({ visible: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Pause ambience', exact: true })
    .filter({ visible: true })
    .click();
  await page.getByRole('button', { name: 'Return to phone view' }).click();
  await page.getByRole('button', { name: /Viewing location/ }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Near me/ })
    .click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Close viewing point' }).click();
  await page.route('**/api/traffic', (route) =>
    route.fulfill({
      json: {
        source: 'ADSB.lol',
        aircraft: [],
        observedAt: null,
        receivedAt: Date.now(),
        freshness: 'unavailable',
        error: 'Offline test',
        retryAfterSeconds: 30,
      },
    }),
  );
  await page.route('**/api/weather', (route) =>
    route.fulfill({
      json: {
        station: airport.weatherStation,
        source: 'NOAA',
        observedAt: null,
        receivedAt: Date.now(),
        freshness: 'unavailable',
        error: 'Offline test',
        retryAfterSeconds: 30,
        temperatureC: null,
        windSpeedKt: null,
        description: 'Unavailable',
      },
    }),
  );
  await page.reload();
  await expect(page.locator('.moment-card')).toContainText(
    'Waiting for live flights',
  );
  await page.screenshot({
    path: `.context/screenshots/${airport.id}-unavailable.png`,
    fullPage: true,
    animations: 'disabled',
  });
});
test('health and production-only boundaries', async ({ request }) => {
  expect((await request.get('/api/health')).status()).toBe(200);
  for (const path of [
    '/airport-lab',
    '/weather-lab',
    '/window-lab',
    '/mobile-lab',
    '/ops/routes',
    '/api/ops/routes',
  ])
    expect((await request.get(path)).status(), path).toBe(404);
  expect((await request.post('/api/route-maintenance')).status()).toBe(404);
});
