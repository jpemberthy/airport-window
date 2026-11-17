// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MobileLab } from '../components/mobile-lab';
import {
  mobilePreview,
  PREVIEW_NOW,
  PREVIEW_SCENARIOS,
} from '../lib/mobile-preview';
import { MOMENT_ORDER } from '../lib/flight-story';

vi.mock('../components/flight-scene', () => ({
  FlightScene: ({ moment }: { moment: string }) => (
    <div data-testid="existing-scene">{moment}</div>
  ),
}));
vi.mock('../components/arcade-globe', () => ({
  default: ({
    route,
  }: {
    route: { origin: { code: string }; destination: { code: string } } | null;
  }) => (
    <div data-testid="existing-globe">
      {route
        ? `${route.origin.code} → ${route.destination.code}`
        : 'Boston alone'}
    </div>
  ),
}));

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function openScenarios() {
  fireEvent.click(screen.getByRole('button', { name: 'More options' }));
  fireEvent.click(screen.getByRole('button', { name: /Preview scenarios/ }));
}
function chooseScenario(value: string) {
  openScenarios();
  fireEvent.change(screen.getByLabelText('Preview screen state'), {
    target: { value },
  });
  fireEvent.click(screen.getByRole('button', { name: /View this preview/ }));
}

describe('mobile design preview', () => {
  it('uses the existing scene/card for all five fixtures and wraps browsing', () => {
    render(<MobileLab />);
    expect(screen.getByText(/SAMPLE DATA \/ NO AUDIO/)).toBeTruthy();
    expect(screen.getByTestId('existing-scene').textContent).toBe('landing');
    for (const expected of [
      'taxi',
      'takeoff',
      'climb',
      'approach',
      'landing',
    ]) {
      fireEvent.click(
        screen.getByRole('button', { name: 'Next sample flight' }),
      );
      expect(screen.getByTestId('existing-scene').textContent).toBe(expected);
    }
    fireEvent.click(
      screen.getByRole('button', { name: 'Previous sample flight' }),
    );
    expect(screen.getByTestId('existing-scene').textContent).toBe('approach');
  });

  it('keeps preview audio state shared between the dock and sheet without playing anything', () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play');
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const { container } = render(<MobileLab />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Play ambience preview' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Sound settings' }));
    expect(
      screen
        .getByRole('button', { name: 'Pause ambience in sound settings' })
        .getAttribute('aria-pressed'),
    ).toBe('true');
    fireEvent.change(screen.getByLabelText('Preview ambience volume'), {
      target: { value: '23' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Play tower in sound settings' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Close Set the atmosphere' }),
    );
    expect(
      screen
        .getByRole('button', { name: 'Pause tower preview' })
        .getAttribute('aria-pressed'),
    ).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Sound settings' }));
    expect(
      (screen.getByLabelText('Preview ambience volume') as HTMLInputElement)
        .value,
    ).toBe('23');
    expect(container.querySelector('audio')).toBeNull();
    expect(play).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('opens real globe component in details, locks background scroll, and restores focus', async () => {
    render(<MobileLab />);
    const trigger = screen.getByRole('button', { name: 'Flight details' });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Flight details' });
    expect(await within(dialog).findByTestId('existing-globe')).toBeTruthy();
    expect(document.body.style.overflow).toBe('hidden');
    expect(
      within(dialog).getByRole('button', { name: 'Close Flight details' }),
    ).toBe(document.activeElement);
    fireEvent(dialog, new Event('cancel', { bubbles: true, cancelable: true }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.body.style.overflow).toBe('');
    expect(document.activeElement).toBe(trigger);
  });

  it('keeps TV discovery secondary and returns to the same phone state', () => {
    const { container } = render(<MobileLab />);
    expect(screen.queryByRole('button', { name: /TV mode/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    fireEvent.click(screen.getByRole('button', { name: /TV mode/ }));
    expect(container.querySelector('.ml-tv')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Phone view' }));
    expect(container.querySelector('.ml-tv')).toBeNull();
    expect(screen.getByTestId('existing-scene').textContent).toBe('landing');
  });

  it('does not reopen the sheet or steal focus when a control changes', () => {
    const show = vi.spyOn(HTMLDialogElement.prototype, 'showModal');
    render(<MobileLab />);
    fireEvent.click(screen.getByRole('button', { name: 'Sound settings' }));
    const slider = screen.getByLabelText('Preview ambience volume');
    slider.focus();
    fireEvent.change(slider, { target: { value: '61' } });
    expect(document.activeElement).toBe(slider);
    expect(show).toHaveBeenCalledTimes(1);
  });

  it('dismisses the backdrop and preserves the previous body scroll setting', () => {
    document.body.style.overflow = 'auto';
    render(<MobileLab />);
    fireEvent.click(screen.getByRole('button', { name: 'Sound settings' }));
    fireEvent.click(screen.getByRole('dialog', { name: 'Set the atmosphere' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.body.style.overflow).toBe('auto');
    document.body.style.overflow = '';
  });

  it('handles no route, long identities, quiet and stale states honestly', async () => {
    const { container } = render(<MobileLab />);
    chooseScenario('no-route');
    expect(container.querySelector('.flight-route')).toBeNull();
    expect(container.textContent).not.toMatch(/route unavailable/i);
    fireEvent.click(screen.getByRole('button', { name: 'Flight details' }));
    expect(await screen.findByText('Boston alone')).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: 'Close Flight details' }),
    );
    chooseScenario('long-name');
    expect(
      container.querySelector('.flight-copy strong')?.textContent,
    ).toContain('Republic Airways for American Airlines');
    chooseScenario('stale');
    expect(screen.getByRole('status').textContent).toContain(
      'last sample position 2m ago',
    );
    chooseScenario('quiet');
    expect(
      screen.getByText('The next reported movement will appear here.'),
    ).toBeTruthy();
    expect(
      (
        screen.getByRole('button', {
          name: 'Flight details',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it('shows nearby samples without locating the visitor or writing preferences', () => {
    const locate = vi.fn();
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition: locate },
    });
    const save = vi.spyOn(Storage.prototype, 'setItem');
    render(<MobileLab />);
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Viewing location: Airport view. Change view',
      }),
    );
    expect(screen.getByText(/Sample viewing point · Winthrop/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Near me' }));
    expect(
      screen.getByRole('region', { name: 'Recently nearby' }),
    ).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Viewing location: Near me. Change view',
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Airport view' }));
    expect(
      screen.queryByRole('region', { name: 'Recently nearby' }),
    ).toBeNull();
    expect(locate).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it('leads with the flight instead of stacking intro, weather and view sections', () => {
    const { container } = render(<MobileLab />);
    expect(
      screen.getByRole('heading', {
        name: 'LoganWatch, Boston Logan',
        level: 1,
      }),
    ).toBeTruthy();
    expect(screen.queryByText('Sample flights')).toBeNull();
    expect(screen.queryByText('BOSTON / KBOS')).toBeNull();
    expect(screen.queryByText('The sky is always on.')).toBeNull();
    expect(
      container.querySelector('.ml-body')?.firstElementChild?.className,
    ).toBe('ml-flight');
    expect(container.querySelector('.ml-flight .ml-view-trigger')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'About this window' }));
    expect(screen.getByText('The sky is always on.')).toBeTruthy();
  });

  it('keeps weather in the header with full conditions one tap away', () => {
    const { container } = render(<MobileLab />);
    const weather = screen.getByRole('button', {
      name: /Boston weather: 58 degrees/,
    });
    expect(container.querySelector('.ml-header')?.contains(weather)).toBe(true);
    weather.focus();
    fireEvent.click(weather);
    const sheet = screen.getByRole('dialog', { name: 'Boston weather' });
    expect(within(sheet).getByText('58°F')).toBeTruthy();
    expect(within(sheet).getByText('Partly cloudy over Logan.')).toBeTruthy();
    fireEvent.click(
      within(sheet).getByRole('button', { name: 'Close Boston weather' }),
    );
    expect(document.activeElement).toBe(weather);
  });

  it('offers the complete scenario catalog and links the maker to the supplied URL', () => {
    render(<MobileLab />);
    expect(
      screen.getByRole('link', { name: 'by jpemberthy' }).getAttribute('href'),
    ).toBe('https://juan.pemberthy.com');
    openScenarios();
    expect(screen.getByLabelText('Preview screen state').children).toHaveLength(
      Object.keys(PREVIEW_SCENARIOS).length,
    );
    expect(screen.getByLabelText('Preview flight scene').children).toHaveLength(
      5,
    );
    fireEvent.change(screen.getByLabelText('Preview flight scene'), {
      target: { value: '4' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Daylight artwork/ }));
    expect(screen.getByText('Daytime palette')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /View this preview/ }));
    expect(screen.getByTestId('existing-scene').textContent).toBe('climb');
  });
});

describe('synthetic mobile fixtures', () => {
  it.each(MOMENT_ORDER)(
    'keeps %s route direction, moment and aircraft aligned',
    (moment) => {
      const index = MOMENT_ORDER.indexOf(moment);
      const data = mobilePreview('normal', index, false);
      expect(data.featured?.moment).toBe(moment);
      expect(data.route?.aircraftId).toBe(data.featured?.flight.id);
      expect(
        index >= 3 ? data.route?.origin.code : data.route?.destination.code,
      ).toBe('BOS');
      expect(data.featured?.flight.observedAt).toBe(PREVIEW_NOW - 3000);
    },
  );
});
