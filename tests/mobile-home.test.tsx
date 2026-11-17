// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Home from '../app/page';
import { mobilePreview, PREVIEW_NOW } from '../lib/mobile-preview';
import { unavailableTraffic } from '../lib/normalize';
import { OBSERVER_KEY } from '../lib/observer';

const playback = vi.hoisted(() => ({
  play: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn().mockResolvedValue(undefined),
  setVolume: vi.fn(),
  close: vi.fn(),
}));
vi.mock('../lib/ambience', () => ({
  WeatherAmbience: class {
    play = playback.play;
    stop = playback.stop;
    setVolume = playback.setVolume;
    close = playback.close;
    setWeather() {}
    setActivity() {}
    setPerspective() {}
    setPageVisible() {}
  },
}));
vi.mock('next/link', () => ({
  default: ({
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a {...props}>{children}</a>
  ),
}));
vi.mock('../components/flight-scene', () => ({
  FlightScene: ({ moment }: { moment: string }) => (
    <div data-testid="scene">{moment}</div>
  ),
}));
vi.mock('../components/arcade-globe', () => ({
  default: () => <div data-testid="globe">Globe</div>,
}));

let fetchMock: ReturnType<typeof vi.fn>;
let mediaPlay: ReturnType<typeof vi.spyOn>;
let locate: ReturnType<typeof vi.fn>;
let fixture: ReturnType<typeof mobilePreview>;
let mediaChanged: (() => void) | undefined;
let phone: boolean;

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(PREVIEW_NOW);
  vi.clearAllMocks();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  phone = true;
  vi.stubGlobal('matchMedia', () => ({
    matches: phone,
    addEventListener: (_: string, callback: () => void) => {
      mediaChanged = callback;
    },
    removeEventListener: () => {},
  }));
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
  mediaPlay = vi
    .spyOn(HTMLMediaElement.prototype, 'play')
    .mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  locate = vi.fn();
  vi.stubGlobal(
    'navigator',
    Object.assign(Object.create(navigator), {
      geolocation: { getCurrentPosition: locate },
    }),
  );
  localStorage.clear();
  window.history.replaceState(null, '', '/');
  fixture = mobilePreview('normal', 0, false);
  // Valid synthetic hexes exercise the actual route hook; fetch stays mocked.
  fixture.moments.forEach((moment, i) => {
    moment.flight.id = `abc00${i}`;
  });
  fixture.route!.aircraftId = 'abc000';
  fetchMock = vi.fn(async (endpoint: string) => ({
    ok: true,
    json: async () =>
      endpoint === '/api/traffic'
        ? {
            ...unavailableTraffic('', PREVIEW_NOW),
            freshness: 'fresh',
            error: null,
            observedAt: PREVIEW_NOW,
            aircraft: fixture.moments.map(({ flight }) => flight),
          }
        : endpoint === '/api/weather'
          ? fixture.weather
          : { route: fixture.route, enabled: true },
  }));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const dock = () =>
  within(screen.getByRole('contentinfo', { name: 'Sound controls' }));
const browse = () =>
  within(screen.getByRole('navigation', { name: 'Browse flights' }));
async function start() {
  const result = render(<Home />);
  await waitFor(() =>
    expect(
      browse()
        .getByRole('button', { name: /Flight details/ })
        .hasAttribute('disabled'),
    ).toBe(false),
  );
  return result;
}

describe('live phone experience', () => {
  it('shares one traffic/weather poll, one card and one audio element with desktop, without autoplay or geolocation', async () => {
    const { container } = await start();
    expect(container.querySelectorAll('.moment-card')).toHaveLength(1);
    expect(container.querySelectorAll('audio')).toHaveLength(1);
    expect(
      fetchMock.mock.calls.filter(([url]) => url === '/api/traffic'),
    ).toHaveLength(1);
    expect(
      fetchMock.mock.calls.filter(([url]) => url === '/api/weather'),
    ).toHaveLength(1);
    expect(locate).not.toHaveBeenCalled();
    expect(mediaPlay).not.toHaveBeenCalled();
    expect(playback.play).not.toHaveBeenCalled();
    expect(
      screen.getByRole('heading', { name: 'LoganWatch, Boston Logan' }),
    ).toBeTruthy();
  });

  it('browses real controller state and opens details in a closable native sheet with the existing globe', async () => {
    const { container } = await start();
    const original = container.querySelector(
      '.flight-copy strong',
    )!.textContent;
    fireEvent.click(browse().getByRole('button', { name: /Next/ }));
    expect(
      container.querySelector('.flight-copy strong')!.textContent,
    ).not.toBe(original);
    const trigger = browse().getByRole('button', { name: /Flight details/ });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Flight details' });
    expect(dialog.classList.contains('phone-sheet')).toBe(true);
    await within(dialog).findByTestId('globe');
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Close flight details' }),
    );
    expect(document.body.style.overflow).toBe('');
    expect(document.activeElement).toBe(trigger);
  });

  it('wires dock and settings to the same real audio state without reopening the sheet on updates', async () => {
    await start();
    fireEvent.click(dock().getByRole('button', { name: 'Play ambience' }));
    await waitFor(() => expect(playback.play).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(
        dock().getByRole('button', { name: 'Pause ambience' }),
      ).toBeTruthy(),
    );
    fireEvent.click(dock().getByRole('button', { name: 'Sound settings' }));
    const dialog = screen.getByRole('dialog');
    const show = vi.spyOn(HTMLDialogElement.prototype, 'showModal');
    fireEvent.change(
      within(dialog).getByRole('slider', { name: 'Ambience volume' }),
      { target: { value: '23' } },
    );
    expect(playback.setVolume).toHaveBeenLastCalledWith(0.23);
    expect(show).not.toHaveBeenCalled();
    expect(
      within(dialog).queryByRole('slider', { name: 'Tower volume' }),
    ).toBeNull();
    fireEvent.click(
      within(dialog).getByRole('button', { name: /Tower radio/ }),
    );
    expect(mediaPlay).toHaveBeenCalledTimes(1);
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('does not request location when choosing Near me; only the explicit location button may do that', async () => {
    await start();
    fireEvent.click(
      screen.getByRole('button', { name: /Viewing location: Airport view/ }),
    );
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: /Near me/,
      }),
    );
    expect(
      screen.getByRole('dialog', { name: 'Choose viewing point' }),
    ).toBeTruthy();
    expect(locate).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Latitude'), {
      target: { value: '42.38' },
    });
    fireEvent.change(screen.getByLabelText('Longitude'), {
      target: { value: '-70.98' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: /Watch near this point/ }),
    );
    expect(JSON.parse(localStorage.getItem(OBSERVER_KEY)!)).toEqual({
      mode: 'nearby',
      viewpoint: { lat: 42.38, lon: -70.98 },
    });
    expect(
      screen.getByRole('button', { name: /Viewing location: Near me/ }),
    ).toBeTruthy();
    expect(locate).not.toHaveBeenCalled();
  });

  it('keeps TV secondary, preserves URL navigation, and Escape closes a sheet without exiting TV', async () => {
    const { container } = await start();
    const routeLookupsBefore = fetchMock.mock.calls.filter(
      ([url]) => url === '/api/route',
    ).length;
    const card = container.querySelector('.moment-card');
    const audio = container.querySelector('audio');
    const flight = container.querySelector('.flight-copy strong')!.textContent;
    fireEvent.click(dock().getByRole('button', { name: 'Play ambience' }));
    await waitFor(() => expect(playback.play).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    fireEvent.click(
      screen.getByRole('button', {
        name: /TV Mode.*Designed for a bigger screen/,
      }),
    );
    expect(window.location.search).toBe('?mode=tv');
    expect(
      container.querySelector('main')!.classList.contains('presentation-mode'),
    ).toBe(true);
    expect(
      screen.getByRole('button', { name: 'Return to phone view' }).textContent,
    ).toBe('Exit TV');
    expect(container.querySelector('.moment-card')).toBe(card);
    expect(container.querySelector('audio')).toBe(audio);
    expect(container.querySelector('.flight-copy strong')!.textContent).toBe(
      flight,
    );
    expect(dock().getByRole('button', { name: 'Pause ambience' })).toBeTruthy();
    await waitFor(() =>
      expect(container.querySelector('.tv-globe')).not.toBeNull(),
    );
    await waitFor(() =>
      expect(container.querySelector('.living-airspace')).not.toBeNull(),
    );
    expect(
      container
        .querySelector('.living-airspace')!
        .classList.contains('is-active'),
    ).toBe(false);
    expect(
      fetchMock.mock.calls.filter(([url]) => url === '/api/traffic'),
    ).toHaveLength(1);
    expect(
      fetchMock.mock.calls.filter(([url]) => url === '/api/route'),
    ).toHaveLength(routeLookupsBefore);
    fireEvent.click(dock().getByRole('button', { name: 'Sound settings' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent(
      screen.getByRole('dialog'),
      new Event('cancel', { cancelable: true }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(window.location.search).toBe('?mode=tv');
    fireEvent.click(
      screen.getByRole('button', { name: 'Return to phone view' }),
    );
    expect(window.location.search).toBe('');
    expect(
      container.querySelector('main')!.classList.contains('presentation-mode'),
    ).toBe(false);
    expect(container.querySelector('.tv-globe')).toBeNull();
    expect(container.querySelector('.moment-card')).toBe(card);
    expect(container.querySelector('audio')).toBe(audio);
    expect(dock().getByRole('button', { name: 'Pause ambience' })).toBeTruthy();
  });

  it('labels the desktop entry TV Mode with a TV icon and a clear exit', async () => {
    phone = false;
    await start();
    expect(screen.queryByRole('button', { name: 'Show harbor' })).toBeNull();
    const entry = screen.getByRole('button', { name: 'Enter TV Mode' });
    expect(entry.textContent).toBe('TV Mode');
    expect(entry.querySelector('.lucide-tv')).not.toBeNull();
    fireEvent.click(entry);
    const exit = screen.getByRole('button', { name: 'Exit TV Mode' });
    expect(exit.textContent).toBe('Exit TV');
    const shortcut = screen.getByRole('button', {
      name: 'Show harbor',
    }) as HTMLButtonElement;
    expect(shortcut.disabled).toBe(true);
    expect(shortcut.getAttribute('aria-describedby')).toBeTruthy();
    fireEvent.click(exit);
    expect(window.location.search).toBe('');
    expect(screen.getByRole('button', { name: 'Enter TV Mode' })).toBeTruthy();
  });

  it('opens bookmarked TV on a phone and keeps the same presentation when resized', async () => {
    window.history.replaceState(null, '', '/?mode=tv');
    const { container } = await start();
    await screen.findByRole('button', { name: 'Return to phone view' });
    expect(
      screen.getByRole('button', { name: 'Show harbor' }).textContent,
    ).toBe('Harbor');
    const card = container.querySelector('.moment-card');
    act(() => {
      phone = false;
      mediaChanged?.();
    });
    expect(
      container.querySelector('main')!.classList.contains('presentation-mode'),
    ).toBe(true);
    expect(container.querySelector('.moment-card')).toBe(card);
    act(() => {
      phone = true;
      mediaChanged?.();
    });
    fireEvent.click(browse().getByRole('button', { name: /Flight details/ }));
    const details = screen.getByRole('dialog', { name: 'Flight details' });
    expect(details.classList.contains('phone-sheet')).toBe(true);
    fireEvent(details, new Event('cancel', { cancelable: true }));
    expect(window.location.search).toBe('?mode=tv');
    expect(container.querySelector('.moment-card')).toBe(card);
    expect(container.querySelectorAll('audio')).toHaveLength(1);
    expect(
      fetchMock.mock.calls.filter(([url]) => url === '/api/traffic'),
    ).toHaveLength(1);
  });

  it('has real weather in its sheet and a creator link in About', async () => {
    await start();
    fireEvent.click(screen.getByRole('button', { name: /Boston weather:/ }));
    expect(
      within(screen.getByRole('dialog')).getByText('Partly cloudy'),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: 'Close Boston weather' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'About' }));
    expect(
      within(screen.getByRole('dialog'))
        .getByRole('link', { name: /Juan Pemberthy/ })
        .getAttribute('href'),
    ).toBe('https://juan.pemberthy.com');
  });

  it('releases scroll lock when changing to desktop without duplicating the feed or audio', async () => {
    const { container } = await start();
    fireEvent.click(browse().getByRole('button', { name: /Flight details/ }));
    act(() => {
      phone = false;
      mediaChanged?.();
    });
    expect(document.body.style.overflow).toBe('');
    expect(screen.getByRole('dialog').classList.contains('phone-sheet')).toBe(
      false,
    );
    expect(container.querySelectorAll('audio')).toHaveLength(1);
    expect(
      fetchMock.mock.calls.filter(([url]) => url === '/api/traffic'),
    ).toHaveLength(1);
  });

  it('keeps missing routes absent and empty activity honest', async () => {
    fixture.route = null;
    const { container } = await start();
    expect(container.querySelector('.flight-route')).toBeNull();
    expect(screen.queryByText(/route unavailable/i)).toBeNull();
    cleanup();
    fixture.moments = [];
    render(<Home />);
    await waitFor(() =>
      expect(screen.getByText('A quiet moment at Boston Logan')).toBeTruthy(),
    );
    expect(
      browse()
        .getByRole('button', { name: /Flight details/ })
        .hasAttribute('disabled'),
    ).toBe(true);
  });

  it('discloses that a usual route comes from prior verified legs', async () => {
    fixture.route!.verification = 'usual';
    fixture.route!.expiresAt = PREVIEW_NOW + 300_000;
    await start();
    fireEvent.click(browse().getByRole('button', { name: /Flight details/ }));
    const details = screen.getByRole('dialog', { name: 'Flight details' });
    expect(within(details).getByText(/Usually:/)).toBeTruthy();
    expect(
      within(details).getByText(
        /learned from prior verified Flightradar24 legs/,
      ),
    ).toBeTruthy();
    expect(within(details).queryByText(/Reported takeoff/)).toBeNull();
  });

  it('labels stale weather and restores a saved device-local viewing point without permission requests', async () => {
    fixture.weather.observedAt = PREVIEW_NOW - 24 * 60 * 60_000;
    localStorage.setItem(
      OBSERVER_KEY,
      JSON.stringify({
        mode: 'nearby',
        viewpoint: { lat: 42.38, lon: -70.98 },
      }),
    );
    await start();
    expect(
      screen.getByRole('button', { name: /Viewing location: Near me/ }),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', {
        name: /Boston weather:.*stale observation/,
      }),
    );
    expect(
      within(screen.getByRole('dialog')).getByText(/Stale observation/),
    ).toBeTruthy();
    expect(locate).not.toHaveBeenCalled();
  });

  it('surfaces tower errors in the phone dock and retains the official-player fallback', async () => {
    await start();
    mediaPlay.mockRejectedValueOnce(new Error('Stream failed'));
    fireEvent.click(dock().getByRole('button', { name: 'Play tower' }));
    await waitFor(() =>
      expect(dock().getByText(/Tower stream could not play/)).toBeTruthy(),
    );
    expect(
      dock()
        .getByRole('link', { name: /Official player/ })
        .getAttribute('href'),
    ).toContain('liveatc.net');
    fireEvent.click(
      dock().getByRole('button', { name: 'Dismiss audio message' }),
    );
    expect(dock().queryByText(/Tower stream could not play/)).toBeNull();
  });

  it('keeps the mobile footer to one utility row and the creator story in About', async () => {
    const { container } = await start();
    const footer = container.querySelector('.phone-footnotes')!;
    expect(footer.querySelectorAll('.phone-footer-row')).toHaveLength(1);
    expect(footer.textContent).not.toMatch(
      /aircraft nearby|by jpemberthy|sound identification/i,
    );
    expect(
      within(footer as HTMLElement).queryByRole('button', {
        name: /Recently nearby/,
      }),
    ).toBeNull();
    fireEvent.click(
      within(footer as HTMLElement).getByRole('button', { name: 'About' }),
    );
    const about = screen.getByRole('dialog', { name: 'About LoganWatch' });
    expect(
      within(about).getByText(/A little window onto Boston Logan/),
    ).toBeTruthy();
    expect(
      within(about).getByRole('link', { name: 'Juan Pemberthy’s website' })
        .textContent,
    ).toContain('jpemberthy');
    expect(about.querySelector('.creator-byline')!.textContent?.trim()).toBe(
      'by jpemberthy',
    );
    fireEvent.click(
      within(about).getByRole('button', { name: 'Close information' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    expect(
      within(screen.getByRole('dialog'))
        .getByRole('link', { name: 'by jpemberthy' })
        .getAttribute('href'),
    ).toBe('https://juan.pemberthy.com');
  });

  it('opens compact nearby history on demand and drills into a past sighting', async () => {
    localStorage.setItem(
      OBSERVER_KEY,
      JSON.stringify({
        mode: 'nearby',
        viewpoint: { lat: 42.38, lon: -70.98 },
      }),
    );
    await start();
    const trigger = screen.getByRole('button', {
      name: /Recently nearby, 3 flights/,
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    trigger.focus();
    fireEvent.click(trigger);
    const history = screen.getByRole('dialog', { name: 'Recently nearby' });
    expect(history.querySelectorAll('.phone-history button')).toHaveLength(3);
    expect(within(history).getByText(/Last 5 minutes/)).toBeTruthy();
    fireEvent.click(history.querySelector('.phone-history button')!);
    expect(
      screen.queryByRole('dialog', { name: 'Recently nearby' }),
    ).toBeNull();
    const details = screen.getByRole('dialog', { name: 'Flight details' });
    expect(within(details).getByText(/Last seen:/)).toBeTruthy();
    fireEvent.click(
      within(details).getByRole('button', { name: 'Close flight details' }),
    );
    expect(document.body.style.overflow).toBe('');
    expect(locate).not.toHaveBeenCalled();
  });

  it('expires nearby history while its sheet is open and closes without leaving scroll locked', async () => {
    localStorage.setItem(
      OBSERVER_KEY,
      JSON.stringify({
        mode: 'nearby',
        viewpoint: { lat: 42.38, lon: -70.98 },
      }),
    );
    await start();
    fireEvent.click(
      screen.getByRole('button', { name: /Recently nearby, 3 flights/ }),
    );
    vi.mocked(Date.now).mockReturnValue(PREVIEW_NOW + 301_000);
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    const history = screen.getByRole('dialog', { name: 'Recently nearby' });
    expect(history.querySelectorAll('.phone-history button')).toHaveLength(0);
    expect(
      within(history).getByText(/History starts when you open the page/),
    ).toBeTruthy();
    fireEvent(history, new Event('cancel', { cancelable: true }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.body.style.overflow).toBe('');
  });
});
