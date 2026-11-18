import { test, expect, type Page } from '@playwright/test';
import airport from '../../airport.config';
import { mkdirSync } from 'node:fs';
import { getTimes } from 'suncalc';
const phases = ['approach', 'landing', 'taxi', 'takeoff', 'climb'] as const;
async function fixtures(
  page: Page,
  phase = 'approach',
  light = 'day',
  condition = 'clear',
) {
  const timestamp =
    light === 'dusk'
      ? getTimes(
          new Date('2026-11-17T15:00:00Z'),
          airport.center.lat,
          airport.center.lon,
        ).sunset!
      : new Date(
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
            callsign: 'ZZZ123',
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
              name: 'Synthetic test airline',
              code: 'ZZ',
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
async function settledScene(page: Page, light = 'day') {
  const scene = page.locator('.moment-card .flight-scene');
  const mix = () =>
    scene.evaluate((el) =>
      Number((el as HTMLElement).style.getPropertyValue('--day-mix')),
    );
  if (light === 'day') await expect.poll(mix).toBe(1);
  else if (light === 'night') await expect.poll(mix).toBe(0);
  else {
    await expect.poll(mix).toBeGreaterThan(0);
    await expect.poll(mix).toBeLessThan(1);
  }
  const images = scene.locator('img');
  await expect
    .poll(() =>
      images.evaluateAll(
        (imgs) =>
          imgs.length > 0 &&
          imgs.every(
            (img) =>
              (img as HTMLImageElement).complete &&
              (img as HTMLImageElement).naturalWidth > 0,
          ),
      ),
    )
    .toBe(true);
  // complete/naturalWidth precede async decoding; wait for the actual paint asset.
  await images.evaluateAll(async (imgs) => {
    await Promise.all(imgs.map((img) => (img as HTMLImageElement).decode()));
  });
}
mkdirSync('.context/screenshots', { recursive: true });
for (const width of [390, 1440])
  test(`${width}px: all phases and day/dusk/night artwork`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    for (const light of ['day', 'dusk', 'night'])
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
        await settledScene(page, light);
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
      await settledScene(page);
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
      page.getByRole('button', {
        name: /Show harbor|Show airport map|Back to stories|Harbor/,
      }),
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
  const health = await request.get('/api/health');
  expect(health.status()).toBe(200);
  expect(await health.json()).toMatchObject({
    status: 'ok',
    airport: airport.icao,
  });
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

test('selected airport labels, local clock and globe follow the pack', async ({
  page,
}) => {
  await fixtures(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/?mode=tv');
  await expect(page).toHaveTitle(new RegExp(airport.brand.title));
  await expect(page.locator('.header-center')).toContainText(
    `${airport.city.toUpperCase()} · ${airport.icao}`,
  );
  const localTime = new Intl.DateTimeFormat('en-US', {
    timeZone: airport.timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date('2026-11-17T15:00:00Z'));
  await expect(page.locator('.header-time time')).toContainText(localTime);
  await expect(
    page
      .getByRole('figure', { name: `Globe centered on ${airport.city}` })
      .filter({ visible: true }),
  ).toBeVisible();
});

for (const width of [320, 390, 1440])
  test(`${width}px: registered airport map in daylight, darkness and adverse weather`, async ({
    page,
  }) => {
    test.skip(!airport.map, 'Selected pack has no map');
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    for (const [light, condition] of [
      ['day', 'clear'],
      ['night', 'clear'],
      ['day', 'rain'],
      ['day', 'fog'],
      ['night', 'snow'],
    ]) {
      await page.unrouteAll();
      await fixtures(page, 'approach', light, condition);
      await page.goto('/?mode=tv');
      const button = page
        .getByRole('button', {
          name: `Show ${(airport.map?.label ?? 'Harbor').toLowerCase()}`,
          exact: true,
        })
        .filter({ visible: true });
      await expect(button).toBeEnabled();
      await button.click();
      const map = page.locator('.living-airspace');
      await expect(map).toHaveAttribute('aria-hidden', 'false');
      await expect(map).toHaveAttribute('data-status', 'ready');
      await expect(map.locator('.harbor-summary')).toContainText('aircraft');
      if (width < 760) {
        const controls = await page
          .locator('.phone-header button')
          .evaluateAll((buttons) =>
            buttons.map((b) => {
              const r = b.getBoundingClientRect();
              return { left: r.left, right: r.right };
            }),
          );
        for (const bounds of controls) {
          expect(bounds.left).toBeGreaterThanOrEqual(0);
          expect(bounds.right).toBeLessThanOrEqual(width);
        }
      }
      await expect
        .poll(() =>
          map
            .locator('img')
            .evaluateAll((images) =>
              images.every((i) => (i as HTMLImageElement).naturalWidth > 0),
            ),
        )
        .toBe(true);
      expect(
        await page
          .locator('body')
          .evaluate((el) => el.scrollWidth <= window.innerWidth),
      ).toBe(true);
      await page.screenshot({
        path: `.context/screenshots/${airport.id}-map-${width}-${light}-${condition}.png`,
        fullPage: true,
        animations: 'disabled',
      });
      await page
        .getByRole('button', { name: 'Back to stories', exact: true })
        .filter({ visible: true })
        .click();
      await expect(map).toHaveAttribute('aria-hidden', 'true');
    }
    expect(errors).toEqual([]);
  });

test('missing airport map artwork keeps the flight scenes available', async ({
  page,
}) => {
  test.skip(!airport.map, 'Selected pack has no map');
  await fixtures(page);
  await page.route(`**${airport.map!.assets.day}`, (route) => route.abort());
  await page.goto('/?mode=tv');
  await expect(page.locator('.moment-card h2')).toContainText('Approach');
  await expect(
    page
      .getByRole('button', {
        name: `Show ${(airport.map?.label ?? 'Harbor').toLowerCase()}`,
        exact: true,
      })
      .filter({ visible: true }),
  ).toBeDisabled();
  await expect(page.locator('.living-airspace')).toHaveAttribute(
    'aria-hidden',
    'true',
  );
});

test('a pack without a map keeps stories when opened through a map link', async ({
  page,
}) => {
  test.skip(Boolean(airport.map), 'Selected pack includes a map');
  await fixtures(page);
  await page.goto('/?mode=tv&view=map');
  await expect(page.locator('.moment-card h2')).toContainText('Approach');
  await expect(page.locator('.living-airspace')).toHaveCount(0);
  await expect(
    page.getByRole('button', {
      name: /Show harbor|Show airport map|Back to stories/,
    }),
  ).toHaveCount(0);
});

test('map link waits for assets and fresh data, then opens the registered view', async ({
  page,
}) => {
  test.skip(!airport.map, 'Selected pack has no map');
  await fixtures(page);
  await page.goto('/?mode=tv&view=map');
  await expect(page.locator('.living-airspace')).toHaveAttribute(
    'data-status',
    'ready',
  );
  await expect(page.locator('.living-airspace')).toHaveAttribute(
    'aria-hidden',
    'false',
  );
  await page
    .getByRole('button', { name: 'Back to stories', exact: true })
    .filter({ visible: true })
    .click();
  await expect(page.locator('.living-airspace')).toHaveAttribute(
    'aria-hidden',
    'true',
  );
});
